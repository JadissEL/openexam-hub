package org.openexamhub.app;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import com.google.android.ump.ConsentDebugSettings;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import com.google.ads.mediation.admob.AdMobAdapter;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.microsoft.clarity.Clarity;
import com.microsoft.clarity.ClarityConfig;
import com.microsoft.clarity.models.ApplicationFramework;
import com.microsoft.clarity.models.LogLevel;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Native bridge for ads, consent, analytics, Clarity and Google sign-in.
 * Ads load only when the web layer asks (signed-in study planner). Debug builds
 * use Google's sample ad units. Release builds stay quiet until real AdMob ids are set.
 */
@CapacitorPlugin(name = "Oeh")
public class OehPlugin extends Plugin {
    private static final String TAG = "Oeh";
    private static final String TEST_BANNER = "ca-app-pub-3940256099942544/9214589741";

    private AdView adView;
    private int bannerHeightDp = 0;
    private boolean bannerPersonalized = false;
    private boolean adsInitialized = false;
    private boolean analyticsEnabled = false;
    private boolean clarityEnabled = false;
    private boolean clarityStarted = false;
    private boolean maskWebView = false;
    private boolean umpReady = false;
    private boolean umpInFlight = false;
    private final List<Runnable> afterUmp = new ArrayList<>();

    @PluginMethod
    public void requestConsent(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(consentResult(false));
            return;
        }
        ensureUmp(activity, () -> call.resolve(consentResult(canRequestAds())));
    }

    @PluginMethod
    public void showPrivacyOptions(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app is not in the foreground.");
            return;
        }
        activity.runOnUiThread(() -> UserMessagingPlatform.showPrivacyOptionsForm(activity, formError -> {
            if (formError != null) call.reject(formError.getMessage());
            else call.resolve(consentResult(canRequestAds()));
        }));
    }

    @PluginMethod
    public void setBanner(PluginCall call) {
        boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", false));
        boolean personalized = Boolean.TRUE.equals(call.getBoolean("personalized", false));
        Activity activity = getActivity();
        if (activity == null || !visible || !adsAllowed()) {
            hideBanner();
            call.resolve(heightResult(0));
            return;
        }
        ensureUmp(activity, () -> activity.runOnUiThread(() -> {
            if (!canRequestAds()) {
                hideBanner();
                call.resolve(heightResult(0));
                return;
            }
            int height = showBanner(activity, personalized);
            call.resolve(heightResult(height));
        }));
    }

    @PluginMethod
    public void setAnalytics(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        analyticsEnabled = enabled;
        try {
            FirebaseAnalytics analytics = FirebaseAnalytics.getInstance(getContext());
            Map<FirebaseAnalytics.ConsentType, FirebaseAnalytics.ConsentStatus> consent =
                new EnumMap<>(FirebaseAnalytics.ConsentType.class);
            FirebaseAnalytics.ConsentStatus status = enabled
                ? FirebaseAnalytics.ConsentStatus.GRANTED
                : FirebaseAnalytics.ConsentStatus.DENIED;
            consent.put(FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE, status);
            consent.put(FirebaseAnalytics.ConsentType.AD_STORAGE, FirebaseAnalytics.ConsentStatus.DENIED);
            consent.put(FirebaseAnalytics.ConsentType.AD_USER_DATA, FirebaseAnalytics.ConsentStatus.DENIED);
            consent.put(FirebaseAnalytics.ConsentType.AD_PERSONALIZATION, FirebaseAnalytics.ConsentStatus.DENIED);
            analytics.setConsent(consent);
            analytics.setAnalyticsCollectionEnabled(enabled);
        } catch (RuntimeException err) {
            Log.w(TAG, "Analytics consent update failed", err);
        }
        call.resolve();
    }

    @PluginMethod
    public void logEvent(PluginCall call) {
        if (!analyticsEnabled) {
            call.resolve();
            return;
        }
        String name = call.getString("name");
        if (name == null || name.isEmpty()) {
            call.resolve();
            return;
        }
        try {
            FirebaseAnalytics analytics = FirebaseAnalytics.getInstance(getContext());
            Bundle bundle = bundleFrom(call.getObject("params"));
            if ("screen_view".equals(name)) {
                analytics.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, bundle);
            } else {
                analytics.logEvent(name, bundle);
            }
        } catch (RuntimeException err) {
            Log.w(TAG, "logEvent failed", err);
        }
        call.resolve();
    }

    @PluginMethod
    public void setScreen(PluginCall call) {
        String name = call.getString("name", "home");
        if (analyticsEnabled) {
            try {
                Bundle bundle = new Bundle();
                bundle.putString(FirebaseAnalytics.Param.SCREEN_NAME, name);
                bundle.putString(FirebaseAnalytics.Param.SCREEN_CLASS, "MainActivity");
                FirebaseAnalytics.getInstance(getContext()).logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, bundle);
            } catch (RuntimeException err) {
                Log.w(TAG, "setScreen failed", err);
            }
        }
        if (clarityEnabled && clarityStarted) {
            try {
                Clarity.setCurrentScreenName(name);
            } catch (RuntimeException err) {
                Log.w(TAG, "Clarity screen name failed", err);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setClarity(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        clarityEnabled = enabled;
        Activity activity = getActivity();
        String projectId = BuildConfig.CLARITY_PROJECT_ID == null ? "" : BuildConfig.CLARITY_PROJECT_ID.trim();
        if (projectId.isEmpty() || activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                if (enabled) {
                    if (!clarityStarted) {
                        ClarityConfig config = new ClarityConfig(projectId);
                        config.setApplicationFramework(ApplicationFramework.Ionic);
                        config.setLogLevel(BuildConfig.DEBUG ? LogLevel.Info : LogLevel.None);
                        Clarity.initialize(activity, config);
                        clarityStarted = true;
                    } else {
                        Clarity.resume();
                    }
                    applyMask();
                } else if (clarityStarted) {
                    Clarity.pause();
                }
            } catch (RuntimeException err) {
                Log.w(TAG, "Clarity update failed", err);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setSensitive(PluginCall call) {
        maskWebView = Boolean.TRUE.equals(call.getBoolean("on", false));
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            applyMask();
            call.resolve();
        });
    }

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String webClientId = webClientId();
        if (webClientId == null || webClientId.isEmpty()) {
            call.reject("Google sign-in needs a Web client ID. In Firebase, add an Android app with package org.openexamhub.app, register this upload key's SHA-1, download a new google-services.json, and rebuild.");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app is not in the foreground.");
            return;
        }
        GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(webClientId)
            .requestEmail()
            .build();
        GoogleSignInClient client = GoogleSignIn.getClient(activity, options);
        startActivityForResult(call, client.getSignInIntent(), "googleSignInResult");
    }

    @ActivityCallback
    private void googleSignInResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            JSObject ret = new JSObject();
            ret.put("idToken", account.getIdToken());
            call.resolve(ret);
        } catch (ApiException err) {
            call.reject("Google sign-in failed (" + err.getStatusCode() + ").");
        }
    }

    @Override
    protected void handleOnPause() {
        if (adView != null) adView.pause();
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (adView != null && adView.getVisibility() == View.VISIBLE) adView.resume();
    }

    @Override
    protected void handleOnDestroy() {
        if (adView != null) {
            adView.destroy();
            adView = null;
        }
        super.handleOnDestroy();
    }

    private void ensureUmp(Activity activity, Runnable then) {
        activity.runOnUiThread(() -> {
            if (umpReady) {
                then.run();
                return;
            }
            afterUmp.add(then);
            if (umpInFlight) return;
            umpInFlight = true;
            ConsentRequestParameters.Builder builder = new ConsentRequestParameters.Builder()
                .setTagForUnderAgeOfConsent(false);
            if (BuildConfig.UMP_DEBUG_EEA) {
                builder.setConsentDebugSettings(new ConsentDebugSettings.Builder(activity)
                    .setDebugGeography(ConsentDebugSettings.DebugGeography.DEBUG_GEOGRAPHY_EEA)
                    .setForceTesting(true)
                    .build());
            }
            ConsentInformation info = UserMessagingPlatform.getConsentInformation(activity);
            info.requestConsentInfoUpdate(activity, builder.build(), () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> {
                if (formError != null) Log.w(TAG, "UMP form: " + formError.getMessage());
                finishUmp();
            }), formError -> {
                Log.w(TAG, "UMP update: " + formError.getMessage());
                finishUmp();
            });
        });
    }

    private void finishUmp() {
        umpReady = true;
        umpInFlight = false;
        List<Runnable> pending = new ArrayList<>(afterUmp);
        afterUmp.clear();
        for (Runnable job : pending) job.run();
    }

    private boolean canRequestAds() {
        try {
            return UserMessagingPlatform.getConsentInformation(getContext()).canRequestAds();
        } catch (RuntimeException err) {
            return false;
        }
    }

    private boolean adsAllowed() {
        if (BuildConfig.DEBUG) return true;
        return BuildConfig.ADS_CONFIGURED;
    }

    private String bannerUnitId() {
        if (BuildConfig.DEBUG) return TEST_BANNER;
        return BuildConfig.ADMOB_BANNER_UNIT_ID;
    }

    private int showBanner(Activity activity, boolean personalized) {
        if (adView != null && adView.getVisibility() == View.VISIBLE && bannerPersonalized == personalized && bannerHeightDp > 0) {
            return bannerHeightDp;
        }
        View web = getBridge() == null ? null : getBridge().getWebView();
        if (web == null || !(web.getParent() instanceof ViewGroup)) return 0;
        ViewGroup parent = (ViewGroup) web.getParent();
        if (!adsInitialized) {
            MobileAds.initialize(activity);
            adsInitialized = true;
        }
        DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
        int widthDp = Math.max(1, (int) (metrics.widthPixels / metrics.density));
        AdSize size = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, widthDp);
        if (adView == null) {
            adView = new AdView(activity);
            adView.setAdSize(size);
            adView.setAdUnitId(bannerUnitId());
            CoordinatorLayout.LayoutParams lp = new CoordinatorLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.gravity = Gravity.BOTTOM;
            lp.bottomMargin = (int) (68 * metrics.density);
            parent.addView(adView, lp);
            adView.setAdListener(new AdListener() {
                @Override
                public void onAdFailedToLoad(LoadAdError error) {
                    Log.w(TAG, "Banner failed: " + error.getMessage());
                    hideBanner();
                    clearAdPadding();
                }
            });
        }
        boolean night = (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
        adView.setBackgroundColor(night ? Color.parseColor("#12110F") : Color.parseColor("#F7F5F0"));
        bannerPersonalized = personalized;
        bannerHeightDp = size.getHeight();
        AdRequest.Builder request = new AdRequest.Builder();
        if (!personalized) {
            Bundle extras = new Bundle();
            extras.putString("npa", "1");
            request.addNetworkExtrasBundle(AdMobAdapter.class, extras);
        }
        adView.setVisibility(View.VISIBLE);
        adView.loadAd(request.build());
        return bannerHeightDp;
    }

    private void hideBanner() {
        Activity activity = getActivity();
        Runnable hide = () -> {
            if (adView != null) adView.setVisibility(View.GONE);
            bannerHeightDp = 0;
        };
        if (activity == null) hide.run();
        else activity.runOnUiThread(hide);
    }

    private void clearAdPadding() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
            "document.documentElement.style.setProperty('--ad','0px')", null));
    }

    private void applyMask() {
        if (!clarityStarted || getBridge() == null || getBridge().getWebView() == null) return;
        View web = getBridge().getWebView();
        if (maskWebView) Clarity.maskView(web);
        else Clarity.unmaskView(web);
    }

    private String webClientId() {
        int id = getContext().getResources().getIdentifier("default_web_client_id", "string", getContext().getPackageName());
        if (id == 0) return "";
        return getContext().getString(id);
    }

    private Bundle bundleFrom(JSObject params) {
        Bundle bundle = new Bundle();
        if (params == null) return bundle;
        Iterator<String> keys = params.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = params.opt(key);
            if (value == null || JSONObjectNull(value)) continue;
            if (value instanceof Integer) bundle.putLong(key, ((Integer) value).longValue());
            else if (value instanceof Long) bundle.putLong(key, (Long) value);
            else if (value instanceof Double) {
                double n = (Double) value;
                if (n == Math.rint(n) && !Double.isInfinite(n)) bundle.putLong(key, (long) n);
                else bundle.putDouble(key, n);
            } else if (value instanceof Boolean) bundle.putString(key, ((Boolean) value) ? "true" : "false");
            else bundle.putString(key, String.valueOf(value));
        }
        return bundle;
    }

    private boolean JSONObjectNull(Object value) {
        return value == org.json.JSONObject.NULL;
    }

    private JSObject heightResult(int height) {
        JSObject ret = new JSObject();
        ret.put("height", height);
        return ret;
    }

    private JSObject consentResult(boolean canRequest) {
        JSObject ret = new JSObject();
        ret.put("canRequestAds", canRequest);
        return ret;
    }
}
