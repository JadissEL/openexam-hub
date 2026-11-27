# OpenExam Hub Android app

The Android app lives in `mobile/`. It is a Capacitor app with its own phone UI. Exam guides, comparison tables, the CLB, CEFR and CRS calculators, and the plan-save rules are the same modules the website uses. The signed-in study planner calls the live site (`https://openexamhub.org`) for plans, the library and account deletion.

Package name: `org.openexamhub.app`. Version `1.0.0` (`versionCode` 1). `targetSdk` 36.

## What you need

- Node.js (the website pins 24.x; the app also builds on Node 22)
- JDK 21
- Android SDK 36, build-tools 36, and an API 36 system image if you want the emulator
- `ANDROID_HOME` pointing at that SDK

From `mobile/`:

```bash
npm install
npm run build
npx cap sync android
```

`cap sync` copies the web build into the Android project and regenerates `android/capacitor-cordova-android-plugins`. That folder is not committed.

## Debug build

```bash
cd mobile/android
# local.properties is gitignored; one line is enough:
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
```

The debug APK is `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Debug builds always use Google's sample AdMob app id and adaptive banner unit. They do not request a production ad.

Install on a device or emulator:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Open a site link even before App Links are verified:

```bash
adb shell am start -a android.intent.action.VIEW -d https://openexamhub.org/exams org.openexamhub.app
```

## Upload key

The upload keystore is not in git. Generate it once and store it outside the repo (a password manager plus an offline copy). Losing it does not block Play updates if Play App Signing is on, but you would need to ask Google to reset the upload key.

```bash
keytool -genkeypair -v \
  -keystore openexam-hub-upload.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=OpenExam Hub, O=OpenExam Hub, C=GR"
```

Point Gradle at it with `mobile/android/keystore.properties` (copy `keystore.properties.example`) or with:

- `OEH_UPLOAD_STORE_FILE`
- `OEH_UPLOAD_STORE_PASSWORD`
- `OEH_UPLOAD_KEY_ALIAS` (`upload`)
- `OEH_UPLOAD_KEY_PASSWORD`

Then:

```bash
cd mobile/android
./gradlew bundleRelease
```

The signed App Bundle is `app/build/outputs/bundle/release/app-release.aab`. Upload that in Play Console. Turn on Play App Signing. The certificate that signs installs is then Google's app signing key, not this upload key.

Print the upload certificate fingerprints (for Firebase, and for checking a sideload). These are not the Play App Signing fingerprints:

```bash
keytool -list -v -keystore openexam-hub-upload.jks -alias upload
```

## Ads (AdMob)

Ads are allowed in one place: the signed-in study planner. Exam guides, published study paths, an open plan, compare, the calculators, home and the library do not request a banner. The library is a tab of `/app` on the website, and it stays ad-free here so reading a resource is not interrupted.

The first launch asks Accept or Reject, with equal buttons. The choice is stored on the device as `oeh_consent_v1`.

- Reject: no Firebase Analytics, no Clarity. A banner is still allowed on the planner once you are signed in, but it is non-personalised (`npa=1`), and only if Google's User Messaging Platform says an ad may be requested.
- Accept: Analytics, Clarity, and a personalised banner when UMP allows it.

UMP runs for EU and UK users (the publisher is in Greece). It is not forced into an EEA debug geography. Set `UMP_DEBUG_EEA=true` in `admob.properties` only when you want to see that form on a test device.

Debug builds use Google's official test ids:

- App id `ca-app-pub-3940256099942544~3347511713`
- Adaptive banner `ca-app-pub-3940256099942544/9214589741`

Release builds read:

- `ADMOB_APP_ID`
- `ADMOB_BANNER_UNIT_ID`

from the environment, from `mobile/android/admob.properties` (copy `admob.properties.example`), or from Gradle `-P` properties. Until both values are real AdMob ids, a release build still has a valid app id in the manifest (the sample id, so the Mobile Ads SDK can start) and it does not request an ad. Replace the placeholders, rebuild the AAB, and upload that build before you expect ads in production. Do not ship a build that requests the sample units.

Create the AdMob app on the same Google account as the site's AdSense, package `org.openexamhub.app`, then paste the ids.

### app-ads.txt

AdMob crawls `https://openexamhub.org/app-ads.txt`. The site serves it with the same handler as `/ads.txt`, so the line is the publisher id already set in production (`ADSENSE_PUBLISHER_ID`). It stays 404 only when that env var is unset. No separate seller line is committed. After this change is deployed, confirm both URLs return the same `google.com` line, and in AdMob set the app's store listing / developer website to `https://openexamhub.org`.

## Analytics (Google Analytics for Firebase)

The Firebase project is `openexam-hub` (project number `168221764927`), the same project as the website. This repo cannot register the Android app from here. Do this once in the Firebase console:

1. Project settings → Add app → Android.
2. Package name `org.openexamhub.app`. Nickname OpenExam Hub.
3. Register the SHA-1 and SHA-256 of the upload key. After Play App Signing is on, also register the SHA-1 and SHA-256 of the App signing key certificate (Play Console → App integrity).
4. Download `google-services.json` and replace `mobile/android/app/google-services.json`. The committed file is a placeholder so Gradle can configure the Google services plugin. Its `mobilesdk_app_id` (`1:168221764927:android:0000000000000000`) is not a real Android app. Analytics events are dropped until it is replaced. The API key in that file is the same public web key already in `src/firebaseConfig.js`.
5. Enable Google Analytics on the Firebase project and link a GA4 property if it is not linked yet. The Android app then reports into that property.

Collection is off in the manifest until the person taps Accept. Events match the website where the app has the same action:

- `screen_view` (Firebase screen view; the website sends `page_view`)
- `sign_up` and `login` with `method` `password` or `google`
- `exam_selected`
- `roadmap_generated`
- `plan_preview`, `plan_preview_open`, `plan_preview_signup_click` when those flows run
- `outbound_official_resource`

The app does not call `/api/hit`. That counter is locked to the website origin.

Email and password sign-in uses the public Firebase web config inside the app. If Auth rejects the WebView origin, add `https://localhost` to the API key's HTTP referrer restrictions (Firebase → the web API key). Do not remove the existing `openexamhub.org` referrers. Google sign-in also needs the Web client id that `google-services.json` generates after the SHA-1 is registered. Until then the button explains what is missing, and email sign-in still works.

Do not create test accounts against the production project while checking the app. A new account emails the founder.

## Microsoft Clarity

Project id `zk5viik44t`, the same project as the website (`CLARITY_PROJECT_ID` in `vite.config.js`). Override it with `CLARITY_PROJECT_ID` in `admob.properties` or the environment if you create a separate app project. Clarity starts only after Accept. On the account screen the WebView is masked, so the password and email fields are not in the recording. Reject calls `Clarity.pause()` and does not start a session.

## Android App Links

`https://openexamhub.org/.well-known/assetlinks.json` is the static file `public/.well-known/assetlinks.json` and a Worker fallback (`lib/assetlinks.js`). Both must stay identical. The SHA-256 in that file is a placeholder:

`00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF`

After the first upload, open Play Console → Test and release → App integrity → App signing key certificate, copy the SHA-256, and replace `PLAY_APP_SIGNING_SHA256_PLACEHOLDER` in `lib/assetlinks.js`. Regenerate the public file with:

```bash
node --input-type=module -e "import { assetlinksJson } from './lib/assetlinks.js'; import { writeFileSync } from 'node:fs'; writeFileSync('public/.well-known/assetlinks.json', assetlinksJson())"
```

Deploy the site. Use the App signing certificate, not the upload certificate, once Play App Signing is on. The intent filters cover `https://openexamhub.org` and `www` for `/`, `/exams`, `/compare`, `/tools` and `/app` (and paths under them). Blog, privacy, about, FAQ and funding stay in the browser.

Search Console does not verify an Android package. App Links are the replacement.

## Play Console

Suggested listing copy is in `docs/play/listing.md`, with the 512×512 icon and the 1024×500 feature graphic. Take phone screenshots from a real debug install (home, an exam guide, the CLB converter, a comparison). Stay signed out and tap Reject so the shots are not a test ad and do not write to production Firebase.

Category: Education.

Content rating: the app is an education tool. It has optional account sign-in, no public user-generated content, and it can show a banner ad in the study planner. Answer the ads question as yes. There is no violence, no unrestricted web view of the open internet as the product, and no location, contacts, photos or payments in the app.

Data safety, based on what this build actually does:

| Data | Collected | Shared | Purpose |
| --- | --- | --- | --- |
| Email address | Yes, if the person creates an account | No | Account, stored in Firebase Auth |
| Name | Only if they use Google sign-in | No | Account |
| App activity (exam, level, saved plan, completed tasks) | Yes, when signed in | No | App functionality, in Firestore |
| Device or other identifiers (advertising ID) | Only if a banner is requested | With Google, via AdMob | Advertising |
| App interactions (screen views and the events above) | Only if they tap Accept | With Google, via Firebase Analytics | Analytics |
| Session recordings and heatmaps | Only if they tap Accept | With Microsoft, via Clarity. Account inputs are masked | Analytics |

Data is encrypted in transit. It is not sold. People can delete a plan in the app, or delete the account by typing DELETE (the same `/api/account` action as the website). There is no Crashlytics. Approximate location is not collected by the app. Declare that users can request deletion, and point the privacy policy URL at `https://openexamhub.org/privacy` after the Android section in this change is deployed.

New personal Play accounts created after 13 November 2023 need a closed test with 12 testers for 14 days before production access. Confirm that requirement in Play Console; it depends on the account type. Play App Signing should stay on.

## Icons

`npm run icons` in `mobile/` redraws the launcher, splash, Play icon and feature graphic from `public/brand/mark.svg`.
