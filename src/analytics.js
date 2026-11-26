// Thin wrapper over window.oeh (public/oeh-consent.js). Events are dropped unless the visitor
// accepted cookies and GA is running on the production hostname, so calling these is always safe.

export function track(name, params = {}) {
  try {
    if (typeof window !== 'undefined' && window.oeh) window.oeh.track(name, params);
  } catch {
    /* analytics must never break the app */
  }
}

/**
 * Cookieless funnel counter (public/oeh-consent.js -> Worker /api/hit): aggregate daily counts only,
 * no consent needed. name: 'preview_opened' | 'signup_started' | 'signup_completed' | 'clb_tool_used'.
 */
export function count(name) {
  try {
    if (typeof window === 'undefined') return;
    if (window.oeh && window.oeh.count) window.oeh.count(name);
    // On first paint the deferred counter script may not have run yet: count once it has.
    else window.addEventListener('load', () => window.oeh?.count?.(name), { once: true });
  } catch {
    /* ignore */
  }
}

/** 'granted' | 'denied' | null (no choice yet). */
export function consentChoice() {
  try {
    return (typeof window !== 'undefined' && window.oeh && window.oeh.consent()) || null;
  } catch {
    return null;
  }
}

/** Ask for a consent choice (shows the banner if none is stored yet). */
export function requireConsent() {
  try {
    if (typeof window !== 'undefined' && window.oeh) window.oeh.require();
  } catch {
    /* ignore */
  }
}

/** sign_up for a brand-new account, login otherwise. `isNew` comes from getAdditionalUserInfo. */
export function trackAuth(method, isNew) {
  track(isNew ? 'sign_up' : 'login', { method });
  if (isNew) count('signup_completed');
}
