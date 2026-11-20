// POST /api/admin/approve {resourceIds[], approve:bool} — Authorization: Bearer ADMIN_SECRET.
// Flips `approved` on library resources (e.g. after reviewing /api/admin/expand candidates).
import { readJsonBody, requireBearer, sendJson } from '../../lib/auth.js';
import { ConfigError } from '../../lib/firebaseAdmin.js';
import { getPub } from '../../lib/store.js';

const ID_RE = /^[a-f0-9]{24}$/; // lib/library.js resourceId(): sha1 hex, 24 chars

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireBearer(req, res, 'ADMIN_SECRET')) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: 'body must be a JSON object' });
  const { resourceIds, approve } = body;
  if (typeof approve !== 'boolean') return sendJson(res, 400, { error: 'approve must be a boolean' });
  if (!Array.isArray(resourceIds) || !resourceIds.length || resourceIds.length > 100) return sendJson(res, 400, { error: 'resourceIds must be an array of 1..100 ids' });
  const ids = [...new Set(resourceIds)];
  if (ids.some((id) => typeof id !== 'string' || !ID_RE.test(id))) return sendJson(res, 400, { error: 'every resourceId must be a 24-char hex library id' });
  try {
    const col = (await getPub()).collection('resources');
    const now = new Date();
    const results = await Promise.all(
      ids.map(async (id) => {
        const ref = col.doc(id);
        const snap = await ref.get();
        if (!snap.exists) return { id, status: 'not_found' };
        const update = { approved: approve, reviewedAt: now, reviewedBy: 'admin' };
        if (approve) update.consecutiveDead = 0; // a human re-approved it; restart the dead-link strike count
        await ref.update(update);
        return { id, status: 'updated', approved: approve, linkStatus: snap.data().linkStatus ?? null };
      })
    );
    return sendJson(res, 200, { ok: true, results, updated: results.filter((r) => r.status === 'updated').length });
  } catch (err) {
    if (err instanceof ConfigError) return sendJson(res, 503, { error: err.message });
    console.error('approve failed', err?.message);
    return sendJson(res, 500, { error: 'approve failed' });
  }
}
