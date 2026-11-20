/**
 * POST /api/account {action:'delete', confirm:'DELETE'}  (Authorization: Bearer <Firebase ID token>)
 *   -> 200 {deleted:true}
 *
 * Self-service account deletion: removes everything under artifacts/{APP_ID}/users/{uid}
 * (profile, plans with their progress, review cards, placement sessions) and then the Firebase
 * Auth user itself. The uid always comes from the verified token, never from the body.
 */
import { cors } from '../http.js';
import { requireAccount, readJsonBody, sendJson } from '../auth.js';
import { deleteAccount } from '../userData.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'Use POST.' });
  }
  const user = await requireAccount(req, res);
  if (!user) return;
  if (user.e2e) return sendJson(res, 400, { error: 'Test token cannot delete an account.' });
  const body = await readJsonBody(req);
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
