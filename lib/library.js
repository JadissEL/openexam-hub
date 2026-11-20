/**
 * Shared resource library (server only).
 *
 *   findResources()   ranked lookup straight from `resources` (legacy path, used as a fallback)
 *   getShelf()        the hot path: ONE doc read (shelves/{EXAM}_{LEVEL}) behind a per-instance LRU
 *   rebuildShelf()    re-rank an (exam, level) shelf from `resources` (ARCHITECTURE.md §B.4)
 *   upsertResource()  canonical URL, dedup, ranking/scheduling fields, create-or-merge without a read
 *   markUsed()        one usage-bucket write per plan (folded by the nightly rollup), not 12 doc writes
 *
 * Resource ids: sha1(normalizeUrl(url))[0:24] until the v3 backfill (scripts/migrate-v3.mjs) has run
 * on the project; then set RESOURCE_IDS_V3=1 to switch new writes to keys.resourceIdFor() (sha1 of
 * the canonical URL). Both are 24 hex chars and identical for URLs without a query string.
 * @module lib/library
 */
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';
import { normalizeUrl } from './allowlist.js';
import { rankResources, shelfEntry, tierScore, nextLinkCheckAt } from './algo/rank.js';
import { canonicalUrl, dedupKey, shelfKey, siteOf, resourceIdFor } from './algo/keys.js';
import { LEVELS, ALL_SKILLS } from './algo/common.js';
import { createLru } from './algo/lru.js';
import { recordUsage } from './counters.js';
import { KNOWN_EXAMS } from './exams.js';

export const SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary', 'mock_exam', 'exam_format'];
const FRESH_DAYS = 14;
export const LIVE_STATUSES = ['ok', 'unverified', 'error'];
export const SHELF_SIZE = 40;
export const SHELF_PER_SKILL = 10;
const REBUILD_QUERY_LIMIT = 500;

export const resourcesCol = () => pub().collection('resources');
export const shelvesCol = () => pub().collection('shelves');

async function countQuery(q) {
  try {
    if (typeof q.count === 'function') return (await q.count().get()).data().count;
    const snap = await q.get();
    return snap.size ?? snap.docs.length;
  } catch {
    return null;
  }
}

/** Same filters as GET /api/library (approved + a live link status), without the 60-item cap. */
export function libraryLiveQuery(col, exam) {
  let q = col.where('approved', '==', true).where('linkStatus', 'in', LIVE_STATUSES);
  if (exam) q = q.where('exams', 'array-contains', exam);
  return q;
}

/**
 * Live library rollup from the `resources` collection. /api/stats and the nightly rollup both
 * use this so public counts stay in sync with GET /api/library.
 */
export async function countLibraryStats(col, exams = KNOWN_EXAMS) {
  const [resources, approvedResources, ok, unverified, error, dead, ...examCounts] = await Promise.all([
    countQuery(col),
    countQuery(col.where('approved', '==', true)),
    ...['ok', 'unverified', 'error', 'dead'].map((s) =>
      countQuery(col.where('approved', '==', true).where('linkStatus', '==', s))
    ),
    ...exams.map((e) => countQuery(libraryLiveQuery(col, e)))
  ]);
  const byExam = {};
  exams.forEach((e, i) => {
    const n = examCounts[i];
    if (n) byExam[e] = { resources: n };
  });
  return {
    resources,
    approvedResources,
    linkHealth: { ok, unverified, error, dead },
    byExam,
    updatedAt: new Date()
  };
}


export const legacyResourceId = (url) => createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 24);
export const idsV3 = () => process.env.RESOURCE_IDS_V3 === '1';
export const resourceId = (url) => (idsV3() ? resourceIdFor(url) : legacyResourceId(url));

const isFresh = (r) => {
  const t = r.lastCheckedAt?.toMillis?.() ?? (r.lastCheckedAt ? Date.parse(r.lastCheckedAt) : 0);
  return Date.now() - (Number.isFinite(t) ? t : 0) < FRESH_DAYS * 864e5;
};

/** shelfKeys of a resource: one per (exam, level); empty levels = every level. */
export function shelfKeysFor(exams = [], levels = []) {
  const lv = levels && levels.length ? levels.filter((l) => LEVELS.includes(l)) : LEVELS;
  const out = [];
  for (const e of exams || []) for (const l of lv) out.push(shelfKey(e, l));
  return [...new Set(out)].slice(0, 120);
}

/** Library-first lookup, ranked (relevance + MMR diversity, lib/algo/rank.js). Signature unchanged. */
export async function findResources({ exam, level, limit = 12 }) {
  const snap = await resourcesCol()
    .where('exams', 'array-contains', exam)
    .where('approved', '==', true)
    .where('linkStatus', 'in', LIVE_STATUSES)
    .limit(200)
    .get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return rankResources(docs, { exam, level }, { k: limit }).map((r) => ({ ...r, fresh: isFresh(r) }));
}

// ---------------------------------------------------------------- shelves

const shelfLru = createLru({ max: 200, ttlMs: 600000 });
/** Test seam / admin: forget cached shelves on this instance. */
export const clearShelfCache = () => shelfLru.clear();

async function queryShelfCandidates(exam) {
  const tagged = await resourcesCol()
    .where('exams', 'array-contains', exam)
    .where('approved', '==', true)
    .where('linkStatus', 'in', LIVE_STATUSES)
    .limit(REBUILD_QUERY_LIMIT)
    .get();
  const docs = tagged.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Resources tagged for no exam ("all exams"); rare, so a cheap second query.
  try {
    const untagged = await resourcesCol().where('exams', '==', []).where('approved', '==', true).limit(100).get();
    for (const d of untagged.docs) docs.push({ id: d.id, ...d.data() });
  } catch {
    /* optional */
  }
  return docs;
}

/** Rebuild shelves/{EXAM}_{LEVEL} from the library (≤ 500 reads, one write). Returns the shelf. */
export async function rebuildShelf(exam, level) {
  const E = String(exam).toUpperCase();
  const L = String(level).toUpperCase();
  const key = shelfKey(E, L);
  const docs = await queryShelfCandidates(E);
  const top = rankResources(docs, { exam: E, level: L }, { k: SHELF_SIZE, maxPerSite: 10 });
  const byId = new Map(top.map((r) => [r.id, r]));
  const bySkill = {};
  for (const skill of ALL_SKILLS) {
    const ranked = rankResources(docs, { exam: E, level: L, skill }, { k: SHELF_PER_SKILL }).filter((r) => (r.skills || []).includes(skill));
    bySkill[skill] = ranked.map((r) => r.id);
    for (const r of ranked) if (!byId.has(r.id)) byId.set(r.id, { ...r, rank: byId.size + 1 });
  }
  const entries = [...byId.values()].map(shelfEntry);
  // version = build time in ms: strictly increasing per shelf, known without a read (ETag, plans.shelfVersion).
  const builtAt = new Date();
  const shelf = { exam: E, level: L, builtAt, version: builtAt.getTime(), entries, bySkill, count: docs.length };
  await shelvesCol().doc(key).set(shelf);
  shelfLru.set(key, shelf);
  return shelf;
}

/** Hot path: the ranked shelf for (exam, level). 0 reads on a warm hit, 1 read otherwise. */
export async function getShelf(exam, level) {
  const key = shelfKey(exam, level);
  return shelfLru.wrap(key, async () => {
    const snap = await shelvesCol().doc(key).get();
    if (snap.exists) {
      const d = snap.data();
      if (Array.isArray(d.entries)) return d;
    }
    return rebuildShelf(exam, level);
  });
}

/**
 * Rebuild every listed shelf key ("TCF_B2", …), sequentially, ignoring failures. Shelves that do
 * not exist yet are skipped unless `createMissing` (getShelf builds them on first request anyway).
 */
export async function rebuildShelves(keys, { createMissing = false } = {}) {
  const done = [];
  for (const k of [...new Set(keys || [])]) {
    const m = /^([A-Z][A-Z0-9_-]{1,19})_(A1|A2|B1|B2|C1|C2)$/.exec(k);
    if (!m) continue;
    try {
      if (!createMissing && !(await shelvesCol().doc(k).get()).exists) { shelfLru.delete(k); continue; }
      await rebuildShelf(m[1], m[2]);
      done.push(k);
    } catch { /* next */ }
  }
  return done;
}

// ---------------------------------------------------------------- writes

const alreadyExists = (err) => err?.code === 6 || /ALREADY_EXISTS|already exists/i.test(String(err?.message || ''));

/**
 * Insert or merge a verified resource. Tags are unioned so one URL serves many exams/levels.
 * 1 write when new (create), +1 dedup read, merge on ALREADY_EXISTS. Returns the doc id.
 */
export async function upsertResource(r, { approved = true, addedBy = 'discovery' } = {}) {
  const url = canonicalUrl(normalizeUrl(r.url));
  const dk = dedupKey(url);
  let ref = resourcesCol().doc(resourceId(url));
  let sameUrl = true;
  // Near-identical URL already stored (www./m., locale segment, index.html …): merge into it.
  try {
    const hit = await resourcesCol().where('dedupKey', '==', dk).limit(1).get();
    if (!hit.empty && hit.docs[0].id !== ref.id) { ref = resourcesCol().doc(hit.docs[0].id); sameUrl = false; }
  } catch {
    /* dedup is an optimisation */
  }
  const skills = (r.skills || []).filter((s) => SKILLS.includes(s));
  const exams = r.exams || [];
  const levels = r.levels || [];
  const shelfKeys = shelfKeysFor(exams, levels);
  const { nextCheckAt, checkIntervalDays } = nextLinkCheckAt({ id: ref.id, status: r.linkStatus, now: Date.now() });
  const common = {
    title: r.title,
    category: r.category,
    license: r.license,
    linkStatus: r.linkStatus,
    httpCode: r.httpCode ?? null,
    lastCheckedAt: FieldValue.serverTimestamp(),
    site: siteOf(url),
    dedupKey: dk,
    tier: tierScore(url, exams[0]),
    nextCheckAt: new Date(nextCheckAt),
    checkIntervalDays
  };
  try {
    await ref.create({
      url, ...common, skills, exams, levels, shelfKeys,
      approved, addedBy, usageCount: 0, completionCount: 0, consecutiveDead: 0,
      firstAddedAt: FieldValue.serverTimestamp()
    });
  } catch (err) {
    if (!alreadyExists(err)) throw err;
    // Existing doc: keep its approved flag, counters and first-added date; union the tags.
    // arrayUnion() with zero arguments throws, so only non-empty lists are unioned.
    await ref.set({
      ...(sameUrl ? { url } : {}),
      ...common,
      ...(skills.length ? { skills: FieldValue.arrayUnion(...skills) } : {}),
      ...(exams.length ? { exams: FieldValue.arrayUnion(...exams) } : {}),
      ...(levels.length ? { levels: FieldValue.arrayUnion(...levels) } : {}),
      ...(shelfKeys.length ? { shelfKeys: FieldValue.arrayUnion(...shelfKeys) } : {})
    }, { merge: true });
  }
  return ref.id;
}

/** One usage-bucket write for the whole plan (the rollup folds it into usageCount). */
export async function markUsed(ids) {
  await recordUsage(ids, 'u');
}
