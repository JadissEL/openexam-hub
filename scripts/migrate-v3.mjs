#!/usr/bin/env node
/**
 * v3 data-model backfill (ARCHITECTURE.md §B.12 steps 2–3). Idempotent: a second run changes nothing.
 *
 *   node scripts/migrate-v3.mjs                 # DRY RUN (default): report only, no writes
 *   node scripts/migrate-v3.mjs --write         # apply (emulator)
 *   node scripts/migrate-v3.mjs --write --i-understand-this-writes-production   # apply to a real project
 *
 * Step 2 — resources: for every doc compute canonical url, v3 id (sha1(canonicalUrl)[0:24]), site,
 *   dedupKey, tier, shelfKeys, completionCount (0 if missing), consecutiveDead (0 if missing),
 *   checkIntervalDays and nextCheckAt (= lastCheckedAt + 14 d if missing).
 *   - If the v3 id differs from the doc id (only URLs with unsorted/extra query params), the doc is
 *     copied to the v3 id (merged if it exists) and the old doc gets duplicateOf + approved:false.
 *     Old docs are never deleted, so saved roadmaps that cite old ids keep their links.
 *   - Near-duplicate clusters (keys.findNearDuplicates: same dedupKey, or same site + title
 *     Jaccard ≥ 0.8) keep their best member; the rest get duplicateOf + approved:false.
 *   - Cached plans that cite a retired id are deleted (rebuilt on the next request).
 * Step 3 — shelves for every (exam, level) that has resources, plus stats/public.
 *
 * After it has run on a project, set RESOURCE_IDS_V3=1 on the server so new writes use v3 ids.
 * Safety: without FIRESTORE_EMULATOR_HOST it refuses to write unless the explicit production flag
 * is given, and it never prints credentials.
 */
import { canonicalUrl, resourceIdFor, dedupKey, siteOf, findNearDuplicates } from '../lib/algo/keys.js';
import { tierScore } from '../lib/algo/rank.js';
import { toMillis } from '../lib/algo/common.js';

const argv = new Set(process.argv.slice(2));
const WRITE = argv.has('--write');
const PROD_OK = argv.has('--i-understand-this-writes-production');
const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const DAY = 864e5;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

if (WRITE && !EMULATOR && !PROD_OK) {
  console.error('Refusing to write: FIRESTORE_EMULATOR_HOST is not set. This would write to a REAL project.');
  console.error('Run without --write for a dry-run report, or add --i-understand-this-writes-production after a review.');
  process.exit(1);
}

const shelfKeysFor = (exams = [], levels = []) => {
  const lv = levels && levels.length ? levels.filter((l) => LEVELS.includes(l)) : LEVELS;
  return [...new Set((exams || []).flatMap((e) => lv.map((l) => `${String(e).toUpperCase()}_${l}`)))].sort();
};
const norm = (v) => (v instanceof Date ? v.toISOString() : Array.isArray(v) ? [...v].sort() : v);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const statusRank = { ok: 3, unverified: 2, error: 1 };

/** Pure planning step (exported for tests): what to change, given all resource docs. */
export function planMigration(docs, now = Date.now()) {
  const updates = new Map(); // id -> partial update
  const copies = []; // {from, to, data}
  const retired = new Map(); // oldId -> newId
  const set = (id, patch) => updates.set(id, { ...(updates.get(id) || {}), ...patch });
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const d of docs) {
    let url;
    try { url = canonicalUrl(d.url); } catch { continue; }
    const v3 = resourceIdFor(url);
    const exams = d.exams || [];
    const patch = {};
    const want = {
      site: siteOf(url),
      dedupKey: dedupKey(url),
      tier: tierScore(url, exams[0]),
      shelfKeys: shelfKeysFor(exams, d.levels || []),
      ...(d.completionCount == null ? { completionCount: 0 } : {}),
      ...(d.consecutiveDead == null ? { consecutiveDead: 0 } : {}),
      ...(d.checkIntervalDays == null ? { checkIntervalDays: 14 } : {}),
      ...(d.nextCheckAt == null ? { nextCheckAt: new Date((toMillis(d.lastCheckedAt) ?? now) + 14 * DAY) } : {})
    };
    for (const [k, v] of Object.entries(want)) if (!same(d[k], v)) patch[k] = v;
    if (url !== d.url && v3 === d.id) patch.url = url;
    if (v3 !== d.id && !d.duplicateOf && byId.has(v3)) {
      // The canonical doc already exists: never overwrite it, just retire this copy.
      retired.set(d.id, v3);
      set(d.id, { duplicateOf: v3, approved: false });
    } else if (v3 !== d.id && !d.duplicateOf) {
      const { id, ...rest } = d;
      copies.push({ from: d.id, to: v3, data: { ...rest, ...want, url, migratedFrom: d.id } });
      retired.set(d.id, v3);
      set(d.id, { duplicateOf: v3, approved: false });
    }
    if (Object.keys(patch).length) set(d.id, patch);
  }
  // Near-duplicates among live docs (after id moves): keep the best, retire the rest.
  const live = docs.filter((d) => !d.duplicateOf && !retired.has(d.id) && d.url);
  const score = (d) => [d.approved !== false ? 1 : 0, statusRank[d.linkStatus] || 0, tierScore(d.url, (d.exams || [])[0]), d.usageCount || 0, -(toMillis(d.firstAddedAt) ?? now)];
  const better = (a, b) => { const x = score(a); const y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return a.id < b.id; };
  const clusters = [];
  for (const g of findNearDuplicates(live)) {
    const members = g.map((i) => live[i]);
    const keep = members.reduce((a, b) => (better(a, b) ? a : b));
    const drop = members.filter((m) => m.id !== keep.id);
    clusters.push({ keep: keep.id, drop: drop.map((m) => m.id), urls: members.map((m) => m.url) });
    for (const m of drop) { retired.set(m.id, keep.id); set(m.id, { duplicateOf: keep.id, approved: false }); }
  }
  return { updates, copies, retired, clusters };
}

async function main() {
  const { getDb, pub } = await import('../lib/firebaseAdmin.js');
  const db = getDb();
  const P = pub();
  const project = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '(from service account)';
  console.log(`migrate-v3 ${WRITE ? 'WRITE' : 'DRY RUN'} — ${EMULATOR ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : 'REAL PROJECT'} — project ${project}, app ${process.env.APP_ID || 'openexam-hub'}`);
  const snap = await P.collection('resources').get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const { updates, copies, retired, clusters } = planMigration(docs);
  console.log(`resources: ${docs.length}; field updates: ${updates.size}; id moves: ${copies.length}; near-duplicate clusters: ${clusters.length}`);
  for (const c of copies) console.log(`  MOVE ${c.from} -> ${c.to} (${c.data.url})`);
  for (const c of clusters) console.log(`  DUP keep ${c.keep}, retire ${c.drop.join(', ')} :: ${c.urls.join(' | ')}`);
  const report = { resources: docs.length, updates: updates.size, moves: copies.length, clusters: clusters.length, plansDeleted: 0, shelves: 0 };
  if (!WRITE) {
    console.log('Dry run: nothing written.', JSON.stringify(report));
    return report;
  }
  // Copies first (create, or merge tags into an existing v3 doc), then field updates in batches.
  for (const c of copies) {
    const ref = P.collection('resources').doc(c.to);
    const cur = await ref.get();
    if (!cur.exists) await ref.set(c.data);
    else {
      const ex = cur.data();
      const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
      await ref.set({ skills: union(ex.skills, c.data.skills), exams: union(ex.exams, c.data.exams), levels: (ex.levels || []).length && (c.data.levels || []).length ? union(ex.levels, c.data.levels) : [], shelfKeys: union(ex.shelfKeys, c.data.shelfKeys) }, { merge: true });
    }
  }
  const entries = [...updates.entries()];
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [id, patch] of entries.slice(i, i + 400)) batch.set(P.collection('resources').doc(id), patch, { merge: true });
    await batch.commit();
  }
  // Cached plans that cite retired ids.
  const ids = [...retired.keys()];
  for (let i = 0; i < ids.length; i += 30) {
    const ps = await P.collection('plans').where('resourceIds', 'array-contains-any', ids.slice(i, i + 30)).get();
    for (const d of ps.docs) { await d.ref.delete(); report.plansDeleted++; }
  }
  // Step 3: shelves + stats/public.
  const after = (await P.collection('resources').get()).docs.map((d) => d.data());
  const keys = new Set();
  for (const r of after) if (r.approved !== false) for (const k of shelfKeysFor(r.exams || [], r.levels || [])) keys.add(k);
  const { rebuildShelves } = await import('../lib/library.js');
  report.shelves = (await rebuildShelves([...keys], { createMissing: true })).length;
  const { buildStats } = await import('../lib/routes/cron/rollup.js');
  await P.collection('stats').doc('public').set(await buildStats(P));
  console.log('Done.', JSON.stringify(report));
  return report;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  main().then(() => process.exit(0), (err) => { console.error('migrate-v3 failed:', err?.message || err); process.exit(1); });
}
