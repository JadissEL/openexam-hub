// AdSense loader for the signed-in dashboard only.
//
// Rules (set by the project owner): ads appear only in the study app at /app for signed-in users,
// never on the landing or info pages; adult, gambling and similar sensitive categories are blocked in
// the AdSense account; all ad income is published on the transparency page.
//
// Consent: users are mostly in the EU, so AdSense must run behind a Google-certified CMP. We use
// Google's own "Privacy & messaging" GDPR message, which the AdSense tag itself brings once it is
// configured in the AdSense account. Before the tag loads we set Google Consent Mode v2 defaults to
// DENIED, and we only request an ad after the CMP's TCF API reports a finished consent decision
// (or that GDPR does not apply). If no CMP answers, no ad is requested.

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

/**
 * Resolves true once the CMP has a final decision (tcloaded / useractioncomplete) or says GDPR
 * does not apply; false if no CMP shows up within `timeoutMs`.
 */
export function waitForConsentDecision(timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
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
      if (Date.now() - started > timeoutMs) return finish(false);
      setTimeout(attach, 250);
    };
    attach();
  });
}
