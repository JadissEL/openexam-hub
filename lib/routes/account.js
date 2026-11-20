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
 * alerts at most once (server-only claim doc), so it cannot be spammed or replayed.
 */
import { cors } from '../http.js';
import { requireAccount, readJsonBody, sendJson, safeEqual } from '../auth.js';
import { getAuth } from 'firebase-admin/auth';
import { deleteAccount } from '../userData.js';
import { cleanHints, countryFromRequest, notifySignup } from '../signupAlert.js';

async function signupNotify(req, res, user, body) {
  try {
    const userRecord = await getAuth().getUser(user.uid);
    const r = await notifySignup({ userRecord, decoded: user, hints: cleanHints(body), country: countryFromRequest(req, safeEqual) });
    return sendJson(res, 200, { status: r.status });
  } catch (err) {
    console.error('[account] signup-notify failed', err?.code || err?.message);
    return sendJson(res, 200, { status: 'failed' });
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
