// Email verification helpers for the app (see lib/userEmails.js for the server side).
// The server sends the branded email through Resend; when it can't (no key, Resend down), it answers
// 'fallback' and we send Firebase's own verification email from the browser instead.
import { sendEmailVerification } from 'firebase/auth';
import { API_BASE } from './firebaseConfig.js';

export const VERIFY_CONTINUE_URL = 'https://openexamhub.org/app';

export const VERIFY_COPY = {
  en: {
    title: 'Check your inbox to verify your email',
    body: (email) => `We sent a confirmation link to ${email}. Verifying keeps your account safe and lets you reset your password.`,
    resend: 'Resend email',
    sending: 'Sending…',
    sent: 'Sent! Check your inbox (and spam folder).',
    wait: (s) => `Please wait ${s}s before asking again.`,
    daily: 'You’ve asked for several emails today. Please try again tomorrow.',
    failed: 'Could not send the email. Please try again in a minute.',
    verified: 'Email verified. Thank you!',
    dismiss: 'Dismiss'
  },
  fr: {
    title: 'Vérifiez votre boîte mail pour confirmer votre adresse',
    body: (email) => `Nous avons envoyé un lien de confirmation à ${email}. La vérification protège votre compte et vous permet de réinitialiser votre mot de passe.`,
    resend: 'Renvoyer l’e-mail',
    sending: 'Envoi…',
    sent: 'Envoyé ! Regardez votre boîte de réception (et les spams).',
    wait: (s) => `Merci de patienter ${s} s avant de redemander.`,
    daily: 'Vous avez demandé plusieurs e-mails aujourd’hui. Réessayez demain.',
    failed: 'Impossible d’envoyer l’e-mail. Réessayez dans une minute.',
    verified: 'Adresse confirmée. Merci !',
    dismiss: 'Fermer'
  }
};

/** Same rule as public/oeh-consent.js: page lang first, then the browser language. */
export function uiLang() {
  try {
    const el = document.querySelector('#root [lang]');
    const l = (el && el.getAttribute('lang')) || document.documentElement.getAttribute('lang') || '';
    if (/^fr/i.test(l)) return 'fr';
    if (/^en/i.test(l) && el) return 'en';
    return /^fr/i.test(navigator.language || '') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export function needsVerification(user) {
  return !!(user && !user.isAnonymous && user.email && !user.emailVerified && (user.providerData || []).some((p) => p?.providerId === 'password'));
}

/** Firebase's own verification email (browser fallback). */
export async function sendFirebaseVerification(user) {
  await sendEmailVerification(user, { url: VERIFY_CONTINUE_URL });
}

/**
 * Ask the server for a new branded email; fall back to Firebase's.
 * @returns {Promise<{status:'sent'|'already-verified'|'rate-limited'|'failed', reason?:string, retryAfterSec?:number}>}
 */
export async function resendVerification(user) {
  try {
    const token = await user.getIdToken();
    const res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'resend-verification', locale: navigator.language })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) return { status: 'rate-limited', reason: data.reason, retryAfterSec: data.retryAfterSec || 60 };
    if (res.ok && (data.status === 'sent' || data.status === 'already-verified')) return { status: data.status };
    if (res.ok && data.status !== 'fallback') return { status: 'failed' };
  } catch {
    /* network: try Firebase directly */
  }
  try {
    await sendFirebaseVerification(user);
    return { status: 'sent' };
  } catch (err) {
    if (err?.code === 'auth/too-many-requests') return { status: 'rate-limited', reason: 'cooldown', retryAfterSec: 60 };
    return { status: 'failed' };
  }
}
