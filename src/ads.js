// AdSense loader for the signed-in dashboard only.
//
// Rules (set by the project owner): ads appear only in the study app at /app for signed-in users,
// never on the landing or info pages; adult, gambling and similar sensitive categories are blocked in
// the AdSense account; all ad income is published on the transparency page.
//
// Consent: Google Consent Mode v2 defaults are DENIED (set by public/oeh-consent.js before any Google
// tag loads). An ad is requested only after the visitor answered the site's cookie banner (or, if
// one is configured in the AdSense account, Google's own TCF consent message reports a decision).
// When the visitor rejected cookies, the ad request is non-personalised (requestNonPersonalizedAds)
// and Consent Mode keeps ad_storage / ad_user_data / ad_personalization denied.

export const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT || '').trim();
export const ADSENSE_SLOT = (import.meta.env.VITE_ADSENSE_SLOT || '').trim();

const CLIENT_RE = /^ca-pub-\d{10,20}$/;

export function adsConfigured() {
  return CLIENT_RE.test(ADSENSE_CLIENT) && /^\d{6,20}$/.test(ADSENSE_SLOT);
}

export function isDashboardPath(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  return /^\/app(\/|$)/.test(pathname);
}

/** Consent Mode v2: everything denied until the CMP updates it. Idempotent. */
export function setConsentDefaults() {
  if (typeof window === 'undefined' || window.__oeConsentDefaults) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500
  });
  window.__oeConsentDefaults = true;
}

let loading = null;
/** Loads adsbygoogle.js once (this also brings Google's CMP message when configured). */
export function loadAdSense() {
  if (typeof document === 'undefined' || !adsConfigured() || !isDashboardPath()) return Promise.reject(new Error('ads off'));
  if (loading) return loading;
  setConsentDefaults();
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('adsense blocked or offline'));
    document.head.appendChild(s);
  });
  return loading;
}

/** The visitor's banner choice: 'granted' | 'denied' | null. */
export function siteConsent() {
  try {
    return (typeof window !== 'undefined' && window.oeh && window.oeh.consent()) || null;
  } catch {
    return null;
  }
}

/** True only when the visitor accepted cookies; otherwise ads must be non-personalised. */
export function personalisedAdsAllowed() {
  return siteConsent() === 'granted';
}

/**
 * Resolves true once the visitor has answered the site's cookie banner, or a TCF CMP has a final
 * decision (tcloaded / useractioncomplete) or says GDPR does not apply. Without the banner script
 * (window.oeh) it resolves false if no CMP shows up within `timeoutMs`.
 */
export function waitForConsentDecision(timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        window.removeEventListener('oeh:consent', onChoice);
        resolve(v);
      }
    };
    const onChoice = () => finish(true);
    const hasBanner = !!(window.oeh && typeof window.oeh.consent === 'function');
    if (hasBanner) {
      if (window.oeh.consent()) return finish(true);
      window.addEventListener('oeh:consent', onChoice);
      window.oeh.require(); // show the banner if it is not already up
    }
    const started = Date.now();
    const attach = () => {
      if (done) return;
      if (typeof window.__tcfapi === 'function') {
        window.__tcfapi('addEventListener', 2, (tcData, ok) => {
          if (!ok || !tcData) return;
          if (tcData.gdprApplies === false) finish(true);
          else if (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete') finish(true);
        });
        return;
      }
      if (!hasBanner && Date.now() - started > timeoutMs) return finish(false);
      if (hasBanner && Date.now() - started > timeoutMs) return; // keep waiting for the banner
      setTimeout(attach, 250);
    };
    attach();
  });
}
