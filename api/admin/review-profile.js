// POST /api/admin/review-profile {exam, reviewed:bool} — Authorization: Bearer ADMIN_SECRET.
// Marks exam_profiles/{EXAM} as human-reviewed (or not).
import { readJsonBody, requireBearer, sendJson } from '../../lib/auth.js';
import { ConfigError } from '../../lib/firebaseAdmin.js';
import { getPub } from '../../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireBearer(req, res, 'ADMIN_SECRET')) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: 'body must be a JSON object' });
  const exam = typeof body.exam === 'string' ? body.exam.trim().toUpperCase() : '';
  if (!/^[A-Z][A-Z0-9_-]{1,23}$/.test(exam)) return sendJson(res, 400, { error: 'exam must be an exam code like TCF or DELE' });
  if (typeof body.reviewed !== 'boolean') return sendJson(res, 400, { error: 'reviewed must be a boolean' });
  try {
    const ref = (await getPub()).collection('exam_profiles').doc(exam);
    const snap = await ref.get();
    if (!snap.exists) return sendJson(res, 404, { error: `exam_profiles/${exam} does not exist yet` });
    await ref.update({ reviewed: body.reviewed, reviewedAt: new Date() });
    return sendJson(res, 200, { ok: true, exam, reviewed: body.reviewed });
  } catch (err) {
    if (err instanceof ConfigError) return sendJson(res, 503, { error: err.message });
    console.error('review-profile failed', err?.message);
    return sendJson(res, 500, { error: 'review failed' });
  }
}
