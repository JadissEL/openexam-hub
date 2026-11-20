/**
 * POST /api/account {action:'delete', confirm:'DELETE'}  (Authorization: Bearer <Firebase ID token>)
 *   -> 200 {deleted:true}
 *
 * Self-service account deletion: removes everything under artifacts/{APP_ID}/users/{uid}
 * (profile, plans with their progress, review cards, placement sessions) and then the Firebase
 * Auth user itself. The uid always comes from the verified token, never from the body.
 *
 * POST /api/account {action:'signup-notify', exam?, locale?, timeZone?}  (same auth)
 *   -> 200 {status:'sent'|'duplicate'|'not-new'|'not-configured'|'failed'}
 *
 * New-signup alert for the founder (lib/signupAlert.js). Called fire-and-forget by the app right
 * after a brand-new account signs in. Only accounts created in the last 24h qualify and each one
 * alerts at most once (server-only claim doc), so it cannot be spammed or replayed. The same call
 * sends the learner's own email (lib/userEmails.js): "verify your email" for unverified
 * email/password accounts, a one-time welcome for Google accounts. Response adds
 * userEmail {kind:'verify'|'welcome'|null, status}; status 'fallback' tells the app to send
 * Firebase's own verification email.
 *
 * POST /api/account {action:'resend-verification', locale?}  (same auth)
 *   -> 200 {status:'sent'|'fallback'|'already-verified'} | 429 {status:'rate-limited', retryAfterSec}
 * At most one send per 60s and 5 per 24h per account.
 */
import { cors } from '../http.js';
import { requireAccount, readJsonBody, sendJson, safeEqual } from '../auth.js';
import { getAuth } from 'firebase-admin/auth';
import { deleteAccount } from '../userData.js';
import { cleanHints, countryFromRequest, notifySignup } from '../signupAlert.js';
import { emailLang, handleSignupUserEmail, isPasswordAccount, sendVerificationEmail } from '../userEmails.js';

async function signupNotify(req, res, user, body) {
  try {
    const userRecord = await getAuth().getUser(user.uid);
    const hints = cleanHints(body);
    const [alert, mail] = await Promise.all([
      notifySignup({ userRecord, decoded: user, hints, country: countryFromRequest(req, safeEqual) }).catch(() => ({ status: 'failed' })),
      handleSignupUserEmail({ userRecord, hints })
    ]);
    return sendJson(res, 200, { status: alert.status, userEmail: { kind: mail.kind, status: mail.status } });
  } catch (err) {
    console.error('[account] signup-notify failed', err?.code || err?.message);
    return sendJson(res, 200, { status: 'failed', userEmail: { kind: null, status: 'failed' } });
  }
}

async function resendVerification(req, res, user, body) {
  try {
    const userRecord = await getAuth().getUser(user.uid);
    if (userRecord.emailVerified) return sendJson(res, 200, { status: 'already-verified' });
    if (!isPasswordAccount(userRecord)) return sendJson(res, 400, { error: 'This account does not use an email and password.' });
    const r = await sendVerificationEmail({ userRecord, lang: emailLang(cleanHints(body).locale), reason: 'resend' });
    if (r.status === 'rate-limited') {
      res.setHeader('Retry-After', String(r.retryAfterSec || 60));
      return sendJson(res, 429, { status: 'rate-limited', reason: r.reason, retryAfterSec: r.retryAfterSec });
    }
    return sendJson(res, 200, { status: r.status });
  } catch (err) {
    console.error('[account] resend-verification failed', err?.code || err?.message);
    return sendJson(res, 200, { status: 'fallback' });
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'Use POST.' });
  }
  const user = await requireAccount(req, res);
  if (!user) return;
  const body = await readJsonBody(req);
  if (body && body.action === 'signup-notify') {
    if (user.e2e) return sendJson(res, 200, { status: 'not-new' });
    return signupNotify(req, res, user, body);
  }
  if (body && body.action === 'resend-verification') {
    if (user.e2e) return sendJson(res, 400, { error: 'Test token cannot do this.' });
    return resendVerification(req, res, user, body);
  }
  if (user.e2e) return sendJson(res, 400, { error: 'Test token cannot delete an account.' });
  if (!body || body.action !== 'delete' || body.confirm !== 'DELETE') {
    return sendJson(res, 400, { error: 'Type DELETE to confirm.' });
  }
  try {
    await deleteAccount(user.uid);
    console.log('[account] deleted account and data');
    return sendJson(res, 200, { deleted: true });
  } catch (err) {
    console.error('[account] delete failed', err?.code || err?.message);
    return sendJson(res, 500, { error: 'Could not delete the account. Please try again or email privacy@openexamhub.org.' });
  }
}
