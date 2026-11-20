/**
 * Link maintenance agent — deterministic, NO LLM.
 *
 * Each run takes the BATCH_SIZE approved resources with the soonest nextCheckAt (adaptive backoff,
 * lib/algo/rank.js nextLinkCheckAt: ok links back off 7→14→30 days, errors retry after 1 day, dead
 * links after 1 day) and re-checks the ones that are due — plus, until the v3 backfill has given every
 * doc a nextCheckAt, the least recently checked docs without one — using the real HTTP checker (lib/linkCheck.js checkLink, concurrency 5) and writes back linkStatus,
 * httpCode, lastCheckedAt and a consecutiveDead counter:
 *   - 'dead'                      -> consecutiveDead + 1; at >= DEAD_STRIKES it sets approved:false
 *                                    and deadSince (first time only). findResources already hides
 *                                    any linkStatus other than ok|unverified, so even one dead result
 *                                    removes it from NEW roadmaps immediately.
 *   - 'ok' | 'unverified'         -> consecutiveDead reset to 0 (a resource that was disabled stays
 *                                    approved:false until an admin re-approves it via /api/admin/approve).
 *   - 'error' | 'off_allowlist'   -> inconclusive (timeout/5xx, or redirect off the allowlist):
 *                                    status recorded, counter left unchanged.
 *
 * Shelves: every shelf listed in shelfKeys of a resource whose linkStatus or approved flag changed
 * is rebuilt after the batch. Status changes are logged to link_checks/{rid}_{yyyymmdd} (TTL 90 d).
 *
 * Cached plans: when a resource is newly disabled (crosses DEAD_STRIKES this run), every plans doc
 * whose resourceIds contains it (array-contains-any, chunks of 30) and every legacy
 * global_verified_roadmaps doc whose roadmap.verifiedResources references it (by id or URL) is
 * DELETED, so the next request rebuilds it from the library. Deletion (not stale:true) was chosen
 * because it is safe no matter how the cache reader is written; the deleted keys are listed in
 * the summary for audit.
 *
 * The summary is written to public/data/metrics/link_health.
 */
import { checkLink } from '../linkCheck.js';
import { getPub } from '../store.js';
import { nextLinkCheckAt } from '../algo/rank.js';

export const BATCH_SIZE = 150;
export const CONCURRENCY = 5;
export const DEAD_STRIKES = 2;

let checker = checkLink;
/** Test seam: replace the HTTP checker. Pass null to restore. */
export function setLinkCheckerForTests(fn) {
  checker = fn || checkLink;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Pure: next state of a resource given one check result. */
export function nextLinkState(resource, result, now) {
  const prevDead = Number(resource.consecutiveDead) || 0;
  const next = nextLinkCheckAt({ id: resource.id || '', status: result.status, prevIntervalDays: Number(resource.checkIntervalDays) || 0, now: now.getTime() });
  const update = { linkStatus: result.status, httpCode: result.httpCode ?? null, lastCheckedAt: now, nextCheckAt: new Date(next.nextCheckAt), checkIntervalDays: next.checkIntervalDays };
  let newlyDisabled = false;
  if (result.status === 'dead') {
    update.consecutiveDead = prevDead + 1;
    if (update.consecutiveDead >= DEAD_STRIKES) {
      newlyDisabled = resource.approved !== false; // was live, now switched off
      update.approved = false;
      if (!resource.deadSince) update.deadSince = now;
    }
  } else if (result.status === 'ok' || result.status === 'unverified') {
    update.consecutiveDead = 0;
  }
  return { update, newlyDisabled };
}

/**
 * @param {{batchSize?: number, timeBudgetMs?: number}} [opts]
 * @returns {Promise<object>} summary (also stored at metrics/link_health)
 */
export async function recheckLinks({ batchSize = BATCH_SIZE, timeBudgetMs = 240000 } = {}) {
  const started = Date.now();
  const pub = await getPub();
  const resources = pub.collection('resources');
  const nowMs = Date.now();
  const due = (d) => {
    const t = d.nextCheckAt?.toMillis?.() ?? (d.nextCheckAt instanceof Date ? d.nextCheckAt.getTime() : null);
    return t == null || t <= nowMs;
  };
  const byId = new Map();
  let queryMode = 'nextCheckAt';
  try {
    const snap = await resources.where('approved', '==', true).orderBy('nextCheckAt', 'asc').limit(batchSize).get();
    for (const d of snap.docs) { const x = { id: d.id, ...d.data() }; if (due(x)) byId.set(x.id, x); }
  } catch {
    queryMode = 'lastCheckedAt'; // composite index (approved, nextCheckAt) not deployed yet
  }
  if (byId.size < batchSize) {
    // Docs without nextCheckAt (written before the v3 backfill) never appear in the query above.
    const snap = await resources.orderBy('lastCheckedAt', 'asc').limit(batchSize).get();
    for (const d of snap.docs) {
      if (byId.size >= batchSize) break;
      const x = { id: d.id, ...d.data() };
      if (byId.has(x.id)) continue;
      if (queryMode === 'nextCheckAt' ? x.nextCheckAt == null : due(x)) byId.set(x.id, x);
    }
  }
  const docs = [...byId.values()];
  const changedShelfKeys = new Set();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counts = { ok: 0, unverified: 0, dead: 0, error: 0, off_allowlist: 0, skipped_time_budget: 0 };
  const newlyDead = [];

  await mapLimit(docs, CONCURRENCY, async (r) => {
    if (Date.now() - started > timeBudgetMs) {
      counts.skipped_time_budget++;
      return;
    }
    let result;
    try {
      result = await checker(r.url);
    } catch {
      result = { status: 'error', httpCode: null };
    }
    if (!(result.status in counts)) result = { status: 'error', httpCode: result.httpCode ?? null };
    counts[result.status]++;
    const { update, newlyDisabled } = nextLinkState(r, result, new Date());
    await resources.doc(r.id).set(update, { merge: true });
    if (newlyDisabled) newlyDead.push({ id: r.id, url: r.url });
    const statusChanged = update.linkStatus !== r.linkStatus || ('approved' in update && update.approved !== r.approved);
    if (statusChanged) {
      const lv = Array.isArray(r.levels) && r.levels.length ? r.levels : ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      // Docs written before the v3 backfill have no shelfKeys: derive them from the tags.
      const keys = Array.isArray(r.shelfKeys) ? r.shelfKeys : (r.exams || []).flatMap((e) => lv.map((l) => `${String(e).toUpperCase()}_${l}`));
      for (const k of keys) changedShelfKeys.add(k);
      try {
        await pub.collection('link_checks').doc(`${r.id}_${day}`).set({
          rid: r.id, from: r.linkStatus ?? null, to: update.linkStatus, httpCode: update.httpCode,
          detail: { url: r.url, approved: update.approved ?? r.approved ?? null }, at: update.lastCheckedAt,
          expireAt: new Date(Date.now() + 90 * 864e5)
        });
      } catch { /* log is best effort */ }
    }
  });

  const invalidated = newlyDead.length ? await invalidateRoadmaps(pub, newlyDead) : [];
  let shelvesRebuilt = [];
  if (changedShelfKeys.size) {
    try {
      const { rebuildShelves } = await import('../library.js');
      shelvesRebuilt = await rebuildShelves([...changedShelfKeys]);
    } catch { /* shelves are also rebuilt by the nightly rollup */ }
  }
  const summary = {
    ranAt: new Date(),
    checked: docs.length - counts.skipped_time_budget,
    counts,
    newlyDisabled: newlyDead,
    invalidatedRoadmaps: invalidated,
    invalidationMode: 'delete',
    queryMode,
    shelvesRebuilt,
    durationMs: Date.now() - started
  };
  await pub.collection('metrics').doc('link_health').set(summary);
  return summary;
}

/** Delete cached plans/roadmaps that reference any of `dead` (matched by resource id or URL). */
async function invalidateRoadmaps(pub, dead) {
  const hits = [];
  // v3 plans: indexed resourceIds, array-contains-any takes at most 30 values per query.
  const idList = [...new Set(dead.map((d) => d.id))];
  for (let i = 0; i < idList.length; i += 30) {
    try {
      const snap = await pub.collection('plans').where('resourceIds', 'array-contains-any', idList.slice(i, i + 30)).select().get();
      await Promise.all(snap.docs.map((d) => pub.collection('plans').doc(d.id).delete()));
      hits.push(...snap.docs.map((d) => `plans/${d.id}`));
    } catch { /* legacy scan below still runs */ }
  }
  hits.push(...(await invalidateLegacy(pub, dead)));
  return hits;
}

/** Legacy cache (kept during the migration): full scan of global_verified_roadmaps. */
async function invalidateLegacy(pub, dead) {
  const ids = new Set(dead.map((d) => d.id));
  const urls = new Set(dead.map((d) => d.url));
  const col = pub.collection('global_verified_roadmaps');
  const snap = await col.select('roadmap.verifiedResources', 'verifiedResources').get();
  const hits = [];
  for (const d of snap.docs) {
    const data = d.data() || {};
    const list = data.roadmap?.verifiedResources || data.verifiedResources || [];
    if (Array.isArray(list) && list.some((v) => ids.has(v?.id) || urls.has(v?.url))) hits.push(d.id);
  }
  await Promise.all(hits.map((id) => col.doc(id).delete()));
  return hits;
}
