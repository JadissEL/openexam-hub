// POST /api/admin/approve {resourceIds[], approve:bool} — Authorization: Bearer ADMIN_SECRET.
// Flips `approved` on library resources (e.g. after reviewing /api/admin/expand candidates).
import { readJsonBody, requireBearer, sendJson } from '../../auth.js';
import { ConfigError } from '../../firebaseAdmin.js';
import { getPub } from '../../store.js';

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
        return { id, status: 'updated', approved: approve, linkStatus: snap.data().linkStatus ?? null, shelfKeys: snap.data().shelfKeys || null, tags: { exams: snap.data().exams || [], levels: snap.data().levels || [] } };
      })
    );
    const updatedIds = results.filter((r) => r.status === 'updated').map((r) => r.id);
    // Rejected resources must leave cached plans right away; shelves are re-ranked either way.
    const invalidatedPlans = [];
    if (!approve && updatedIds.length) {
      const pub = await getPub();
      for (let i = 0; i < updatedIds.length; i += 30) {
        try {
          const snap = await pub.collection('plans').where('resourceIds', 'array-contains-any', updatedIds.slice(i, i + 30)).select().get();
          await Promise.all(snap.docs.map((d) => pub.collection('plans').doc(d.id).delete()));
          invalidatedPlans.push(...snap.docs.map((d) => d.id));
        } catch { /* best effort */ }
      }
    }
    let shelvesRebuilt = [];
    const updated = results.filter((r) => r.status === 'updated');
    if (updated.length) {
      try {
        const { rebuildShelves, shelfKeysFor } = await import('../../library.js');
        // Docs written before the v3 backfill have no shelfKeys: derive them from the tags.
        const keys = updated.flatMap((r) => r.shelfKeys || shelfKeysFor(r.tags.exams, r.tags.levels));
        shelvesRebuilt = await rebuildShelves(keys);
      } catch { /* nightly rollup rebuilds shelves too */ }
    }
    return sendJson(res, 200, { ok: true, results: results.map(({ shelfKeys, tags, ...r }) => r), updated: updatedIds.length, invalidatedPlans, shelvesRebuilt });
  } catch (err) {
    if (err instanceof ConfigError) return sendJson(res, 503, { error: err.message });
    console.error('approve failed', err?.message);
    return sendJson(res, 500, { error: 'approve failed' });
  }
}
