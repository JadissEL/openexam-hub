/**
 * Link maintenance agent — deterministic, NO LLM.
 *
 * Each run re-checks the BATCH_SIZE library resources with the oldest lastCheckedAt using the
 * real HTTP checker (lib/linkCheck.js checkLink, concurrency 5) and writes back linkStatus,
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
 * Cached roadmaps: when a resource is newly disabled (crosses DEAD_STRIKES this run), every
 * global_verified_roadmaps doc whose roadmap.verifiedResources references it (by id or URL) is
 * DELETED, so the next request rebuilds it from the library. Deletion (not stale:true) was chosen
 * because it is safe no matter how the cache reader is written; the deleted keys are listed in
 * the summary for audit.
 *
 * The summary is written to public/data/metrics/link_health.
 */
import { checkLink } from '../linkCheck.js';
import { getPub } from '../store.js';

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
  const update = { linkStatus: result.status, httpCode: result.httpCode ?? null, lastCheckedAt: now };
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
  const snap = await resources.orderBy('lastCheckedAt', 'asc').limit(batchSize).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  });

  const invalidated = newlyDead.length ? await invalidateRoadmaps(pub, newlyDead) : [];
  const summary = {
    ranAt: new Date(),
    checked: docs.length - counts.skipped_time_budget,
    counts,
    newlyDisabled: newlyDead,
    invalidatedRoadmaps: invalidated,
    invalidationMode: 'delete',
    durationMs: Date.now() - started
  };
  await pub.collection('metrics').doc('link_health').set(summary);
  return summary;
}

/** Delete cached roadmaps that reference any of `dead` (matched by resource id or URL). */
async function invalidateRoadmaps(pub, dead) {
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
