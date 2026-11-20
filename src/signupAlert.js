// Tells the server a brand-new account was just created, so the founder gets a signup alert email
// and the learner gets their own email (verify link for email/password, welcome for Google)
// (POST /api/account {action:'signup-notify'}, see lib/signupAlert.js). Fire-and-forget: it never
// blocks or delays sign-up, never throws, and runs at most once per account per browser. The server
// re-checks everything (verified token, account age < 24h, one alert per account), so this is only
// a hint; a nightly sweep catches any alert this call misses.
import { API_BASE, SERVER_ENABLED } from './firebaseConfig.js';
import { sendFirebaseVerification } from './verifyEmail.js';

const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;
const flagKey = (uid) => `oeh_signup_alert_${uid}`;
const fallbackKey = (uid) => `oeh_verify_fallback_${uid}`;
const inflight = new Set();

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the server-side dedupe still holds */
  }
}

/** Remember the exam a visitor arrived for (?exam=) so the alert can mention it. */
function examHint() {
  try {
    const q = new URLSearchParams(window.location.search).get('exam');
    if (q) {
      window.sessionStorage.setItem('oeh_signup_exam', q.slice(0, 40));
      return q.slice(0, 40);
    }
    return window.sessionStorage.getItem('oeh_signup_exam') || undefined;
  } catch {
    return undefined;
  }
}

function needsVerificationLocal(user) {
  return !!(user && user.email && !user.emailVerified && (user.providerData || []).some((p) => p?.providerId === 'password'));
}

export function isFreshAccount(user, now = Date.now()) {
  if (!user || user.isAnonymous) return false;
  const created = Date.parse(user.metadata?.creationTime || '');
  return Number.isFinite(created) && now - created >= -60000 && now - created <= NEW_ACCOUNT_MS;
}

/** Call from onAuthStateChanged with the signed-in user; does nothing for older accounts. */
export function notifySignupOnce(user) {
  try {
    if (!SERVER_ENABLED || typeof window === 'undefined' || typeof fetch !== 'function') return;
    if (!isFreshAccount(user) || inflight.has(user.uid) || storageGet(flagKey(user.uid))) return;
    inflight.add(user.uid);
    const exam = examHint();
    const run = async () => {
      const token = await user.getIdToken();
      let timeZone;
      try {
        timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        timeZone = undefined;
      }
      const res = await fetch(`${API_BASE}/api/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'signup-notify', exam, locale: navigator.language, timeZone }),
        keepalive: true
      });
      const data = await res.json().catch(() => ({}));
      // The learner's own "verify your email": the server could not send the branded one, so send
      // Firebase's. Only when the server says so (it rate limits), and once per account per browser.
      if (data?.userEmail?.kind === 'verify' && data.userEmail.status === 'fallback' && !storageGet(fallbackKey(user.uid))) {
        storageSet(fallbackKey(user.uid), '1');
        sendFirebaseVerification(user).catch(() => {});
      }
      // 'sent' / 'duplicate' / 'not-new' are final; anything else retries on a later visit.
      if (res.ok && ['sent', 'duplicate', 'not-new'].includes(data.status)) storageSet(flagKey(user.uid), '1');
    };
    run()
      .catch(() => {
        // API unreachable: still make sure an unverified email/password learner gets a link.
        if (needsVerificationLocal(user) && !storageGet(fallbackKey(user.uid))) {
          storageSet(fallbackKey(user.uid), '1');
          sendFirebaseVerification(user).catch(() => {});
        }
      })
      .finally(() => inflight.delete(user.uid));
  } catch {
    /* never let an alert break the app */
  }
}

// Capture ?exam= on first load, before sign-up navigation can drop it from the URL.
if (typeof window !== 'undefined') examHint();
