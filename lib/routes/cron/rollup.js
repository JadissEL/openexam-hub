/**
 * GET /api/cron/rollup — nightly Vercel cron (Authorization: Bearer CRON_SECRET), ARCHITECTURE.md §B.5.
 *
 *  1. usage_buckets (older than the current hour) -> resources.usageCount / completionCount.
 *     One atomic batch per bucket: the increments AND the bucket delete commit together, so a crash
 *     can never count a bucket twice (idempotent re-runs).
 *  2. calib_buckets -> item_sets/{EXAM}_{LEVEL}.b (b ← b − K(n)·Σerr, K(n) = 0.4/(1+n/20), the
 *     batched form of placement.eloUpdate), again folded + deleted in one batch per bucket.
 *  3. counters/{name}/shards/* summed -> stats/public, together with library counts.
 *  4. every existing shelf is rebuilt (fresh ranking with the new usage/completion numbers).
 * Time-budgeted; anything left over is picked up by the next run.
 */
import { requireBearer, sendJson } from '../../auth.js';
import { getDb, getPub } from '../../store.js';
import { FieldValue } from 'firebase-admin/firestore';
import { hourKey } from '../../counters.js';
import { KNOWN_EXAMS } from '../../exams.js';

const BUDGET_MS = 240000;
const RID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function foldUsage(db, pub, { started = Date.now(), budgetMs = BUDGET_MS } = {}) {
  const current = hourKey();
  const snap = await pub.collection('usage_buckets').limit(500).get();
  let folded = 0;
  let skipped = 0;
  const touched = new Set();
  for (const d of snap.docs) {
    if (Date.now() - started > budgetMs) break;
    const hour = d.id.split('_')[1] || '';
    if (hour >= current) { skipped++; continue; } // still receiving writes
    const data = d.data() || {};
    const totals = new Map();
    for (const [kind, field] of [['u', 'usageCount'], ['c', 'completionCount']]) {
      for (const [rid, n] of Object.entries(data[kind] || {})) {
        if (!RID_RE.test(rid) || !Number.isFinite(n) || n <= 0) continue;
        const t = totals.get(rid) || {};
        t[field] = (t[field] || 0) + n;
        totals.set(rid, t);
      }
    }
    const ids = [...totals.keys()].slice(0, 400);
    const refs = ids.map((id) => pub.collection('resources').doc(id));
    const snaps = await Promise.all(refs.map((r) => r.get()));
    const batch = db.batch();
    snaps.forEach((s, i) => {
      if (!s.exists) return; // resource deleted since: drop its counts
      const inc = {};
      for (const [f, n] of Object.entries(totals.get(ids[i]))) inc[f] = FieldValue.increment(n);
      batch.set(refs[i], inc, { merge: true });
      touched.add(ids[i]);
    });
    batch.delete(pub.collection('usage_buckets').doc(d.id));
    await batch.commit();
    folded++;
  }
  return { folded, skipped, resourcesUpdated: touched.size };
}

export async function foldCalibration(db, pub, { started = Date.now(), budgetMs = BUDGET_MS } = {}) {
  const snap = await pub.collection('calib_buckets').limit(200).get();
  let folded = 0;
  for (const d of snap.docs) {
    if (Date.now() - started > budgetMs) break;
    const data = d.data() || {};
    const m = /^\d+_([A-Z][A-Z0-9_-]{1,19})_(A1|A2|B1|B2|C1|C2)$/.exec(d.id);
    const batch = db.batch();
    if (m) {
      const setRef = pub.collection('item_sets').doc(`${m[1]}_${m[2]}`);
      const cur = (await setRef.get()).data() || {};
      const b = { ...(cur.b || {}) };
      const n = { ...(cur.n || {}) };
      for (const [k, v] of Object.entries(data.items || {})) {
        if (!RID_RE.test(k) || !Number.isFinite(v?.err) || !Number.isFinite(v?.n) || v.n <= 0) continue;
        const prevN = Number(n[k]) || 0;
        const anchor = { A1: -2.5, A2: -1.5, B1: -0.5, B2: 0.5, C1: 1.5, C2: 2.5 }[k.split('_')[0]] ?? 0;
        const prevB = Number.isFinite(b[k]) ? b[k] : anchor;
        const K = 0.4 / (1 + prevN / 20);
        b[k] = Math.round(Math.max(-4, Math.min(4, prevB - K * v.err)) * 1e4) / 1e4;
        n[k] = prevN + v.n;
      }
      batch.set(setRef, { exam: m[1], level: m[2], b, n, updatedAt: new Date() }, { merge: true });
    }
    batch.delete(pub.collection('calib_buckets').doc(d.id));
    await batch.commit();
    folded++;
  }
  return { folded };
}

async function sumCounters(pub) {
  const out = {};
  const col = pub.collection('counters');
  const refs = typeof col.listDocuments === 'function' ? await col.listDocuments() : [];
  for (const ref of refs.slice(0, 200)) {
    const shards = await ref.collection('shards').get();
    out[ref.id] = shards.docs.reduce((a, s) => a + (Number(s.data()?.n) || 0), 0);
  }
  return out;
}

async function countWhere(q) {
  try {
    if (typeof q.count === 'function') return (await q.count().get()).data().count;
    return (await q.get()).docs.length;
  } catch {
    return null;
  }
}

export async function buildStats(pub) {
  const res = pub.collection('resources');
  const counters = await sumCounters(pub);
  const [resources, approvedResources, ok, unverified, error, dead] = await Promise.all([
    countWhere(res),
    countWhere(res.where('approved', '==', true)),
    ...['ok', 'unverified', 'error', 'dead'].map((s) => countWhere(res.where('approved', '==', true).where('linkStatus', '==', s)))
  ]);
  const byExam = {};
  for (const e of KNOWN_EXAMS) {
    const n = await countWhere(res.where('exams', 'array-contains', e).where('approved', '==', true));
    if (n) byExam[e] = { resources: n };
  }
  const plansBuilt = counters.roadmapsGenerated || 0;
  const hits = counters.cacheHits || 0;
  return {
    resources, approvedResources,
    plansBuilt, cacheHits: hits,
    cacheHitRate: plansBuilt + hits ? Math.round((hits / (plansBuilt + hits)) * 1000) / 1000 : null,
    fallbackPlans: counters.fallbackPlans || 0,
    linkHealth: { ok, unverified, error, dead },
    byExam,
    updatedAt: new Date()
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireBearer(req, res, 'CRON_SECRET')) return;
  const started = Date.now();
  try {
    const db = await getDb();
    const pub = await getPub();
    const usage = await foldUsage(db, pub, { started });
    const calibration = await foldCalibration(db, pub, { started });
    const stats = await buildStats(pub);
    await pub.collection('stats').doc('public').set(stats);
    let shelves = [];
    try {
      const snap = await pub.collection('shelves').select().get();
      const { rebuildShelves } = await import('../../library.js');
      shelves = await rebuildShelves(snap.docs.map((d) => d.id));
    } catch (err) {
      shelves = { error: err?.message || 'shelf rebuild failed' };
    }
    return sendJson(res, 200, { ok: true, usage, calibration, stats: { ...stats, updatedAt: stats.updatedAt.toISOString() }, shelvesRebuilt: shelves, durationMs: Date.now() - started });
  } catch (err) {
    console.error('rollup failed', err?.message);
    return sendJson(res, 500, { error: 'rollup failed' });
  }
}
