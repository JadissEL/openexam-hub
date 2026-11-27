/**
 * Canonical keys, URL canonicalisation and near-duplicate detection. Pure, deterministic.
 *
 *  - Day buckets: requests are snapped to the nearest of 7/14/30/60/90/180 days on a log scale,
 *    so "28 days" and "30 days" share one cached plan skeleton (resources + polished wording);
 *    the exact day-by-day schedule is then recomputed for the real `days` by schedule.js (<1 ms).
 *  - Diagnostic quantisation: each skill score 0..1 -> band w (<0.4) / m (<0.7) / s, so a
 *    personalised plan is cacheable: at most 3^6 = 729 profiles per (exam, level, bucket), and in
 *    practice a few dozen. Scores near a band edge are stable because the bands are coarse.
 *  - URL canonicalisation (RFC 3986 §6 normalisation + tracking-param removal + sorted query).
 *  - Near-duplicate detection: exact dedup key (www./locale/index stripped) OR title character-
 *    shingle Jaccard >= threshold on the same site, with MinHash + LSH banding (Broder 1997;
 *    Indyk & Motwani 1998) for candidate generation so it is ~O(n) instead of O(n^2).
 *
 * @module lib/algo/keys
 */
import { createHash } from 'node:crypto';
import { LEVELS, STUDY_SKILLS, fnv1a, siteOf } from './common.js';
import { variantKeySuffix } from '../exams.js';

export const DAY_BUCKETS = [7, 14, 30, 60, 90, 180];
export const SCORE_BANDS = [{ code: 'w', below: 0.4 }, { code: 'm', below: 0.7 }, { code: 's', below: Infinity }];
export const KEY_VERSION = 'v3';

/** Nearest bucket by log-ratio (ties go to the larger bucket, which compresses rather than pads). */
export function bucketDays(days) {
  const d = Math.max(1, Math.min(180, Math.round(Number(days) || 1)));
  let best = DAY_BUCKETS[0];
  let bestDist = Infinity;
  for (const b of DAY_BUCKETS) {
    const dist = Math.abs(Math.log(d / b));
    if (dist < bestDist - 1e-12 || (Math.abs(dist - bestDist) <= 1e-12 && b > best)) { best = b; bestDist = dist; }
  }
  return best;
}

/** Quantise diagnostic skill scores to a fixed-order band string, e.g. "wmsm-s" (listening,reading,writing,speaking,grammar,vocabulary; '-' = not measured). */
export function quantiseProfile(skillScores) {
  if (!skillScores || typeof skillScores !== 'object') return null;
  let any = false;
  const code = STUDY_SKILLS.map((s) => {
    const v = skillScores[s];
    if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
    any = true;
    const x = Math.max(0, Math.min(1, v));
    return SCORE_BANDS.find((b) => x < b.below).code;
  }).join('');
  return any ? code : null;
}

/** Representative scores for a band code (band midpoints), used when re-planning from a cached profile. */
export function profileToScores(code) {
  const mid = { w: 0.25, m: 0.55, s: 0.85 };
  if (typeof code !== 'string' || code.length !== STUDY_SKILLS.length) return null;
  const out = {};
  STUDY_SKILLS.forEach((s, i) => { if (mid[code[i]] != null) out[s] = mid[code[i]]; });
  return out;
}

/**
 * Plan cache document id. Deterministic, URL/doc-id safe, never monotonically increasing.
 *   generic:      TCF_B2_30
 *   personalised: TCF_B2_30_wmsm-s
 *   TCF Canada:   TCF_B2_30_CANADA  (non-default variant suffix, before any profile band)
 */
export function planKey({ exam, level, days, skillScores = null, variant = null }) {
  const E = String(exam || '').trim().toUpperCase();
  const L = String(level || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,19}$/.test(E)) throw new Error('planKey: bad exam');
  if (!LEVELS.includes(L)) throw new Error('planKey: bad level');
  const prof = quantiseProfile(skillScores);
  const v = variantKeySuffix(E, variant);
  return `${E}_${L}_${bucketDays(days)}${v ? `_${v}` : ''}${prof ? `_${prof}` : ''}`;
}

/** Shelf doc id for (exam, level): one read on the hot path. */
export const shelfKey = (exam, level) => `${String(exam).toUpperCase()}_${String(level).toUpperCase()}`;

// ------------------------------------------------------------------ URLs

const TRACKING_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|_ga|_gl|_hsenc|_hsmi|mkt_tok|oly_anon_id|oly_enc_id|vero_id|spm|ref_src|cmpid|at_medium|at_campaign|xtor|feature|cbrd|ucbcb)$/i;

/**
 * Canonical URL used for the library id: lower-case scheme/host, no default port, no fragment,
 * no tracking params, remaining query params sorted, duplicate slashes collapsed, dot-segments
 * resolved (WHATWG URL does that), no trailing slash except root. Idempotent.
 * Superset of lib/allowlist.js normalizeUrl() (same output for URLs without unsorted/extra params).
 */
export function canonicalUrl(raw) {
  const u = new URL(String(raw).trim());
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, '');
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = '';
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k));
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  u.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
  let path = u.pathname.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  u.pathname = path;
  return u.toString();
}

/** Resource document id: first 24 hex chars of sha1(canonicalUrl). Uniformly distributed (no hotspots). */
export function resourceIdFor(url) {
  return createHash('sha1').update(canonicalUrl(url)).digest('hex').slice(0, 24);
}

const LOCALE_SEG = /^(?:[a-z]{2}(?:[-_][a-z]{2,4})?|intl|international)$/i;
const LOCALE_WHITELIST = new Set(['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ar', 'zh', 'ja', 'ko', 'tr', 'el', 'sv', 'da', 'fi', 'no', 'cs', 'hu', 'ro', 'uk']);

/** Is a path segment a locale (en, fr-fr, en_GB, de-DE...)? Only real language codes count. */
export function isLocaleSegment(seg) {
  if (!LOCALE_SEG.test(seg)) return false;
  const lang = seg.slice(0, 2).toLowerCase();
  return /^intl|international$/i.test(seg) || LOCALE_WHITELIST.has(lang);
}

/**
 * Looser key for duplicate detection only (NOT an id): host without www./m., locale path
 * segments replaced by "*", index.html / index.php dropped, case-folded path, no query.
 * Two URLs with the same dedupKey are treated as the same page in different locales/mirrors.
 */
export function dedupKey(raw) {
  const u = new URL(canonicalUrl(raw));
  const host = u.hostname.replace(/^(?:www\d?|m|mobile)\./, '');
  const segs = u.pathname.split('/').filter(Boolean).map((s) => (isLocaleSegment(s) ? '*' : s.toLowerCase()));
  if (segs.length && /^index\.(?:html?|php|aspx?)$/.test(segs[segs.length - 1])) segs.pop();
  // YouTube watch URLs are identified by ?v=, not the /watch path. Dropping the query
  // would collapse every video on youtube.com into one library item.
  const v = (/(^|\.)youtube\.com$/.test(u.hostname) && u.searchParams.get('v') || '').trim();
  return v ? `${host}/${segs.join('/')}?v=${v}` : `${host}/${segs.join('/')}`;
}

export { siteOf };

// ------------------------------------------------------------------ titles

/** Normalise a title: NFKD, strip diacritics, lower-case, keep letters/digits, single spaces. */
export function normTitle(t) {
  return String(t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/g, ' ').trim();
}

/** Character k-shingles (default 3) of the normalised title, as a Set of strings. */
export function shingles(title, k = 3) {
  const s = ` ${normTitle(title)} `;
  const out = new Set();
  if (s.trim().length === 0) return out;
  if (s.length <= k) { out.add(s); return out; }
  for (let i = 0; i + k <= s.length; i++) out.add(s.slice(i, i + k));
  return out;
}

/** Jaccard similarity |A∩B| / |A∪B| of two Sets (1 for two empty sets). */
export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export const titleSimilarity = (t1, t2) => jaccard(shingles(t1), shingles(t2));

/** True if two resources are near-duplicates (same dedupKey, or same site + title Jaccard >= threshold). */
export function isNearDuplicate(a, b, { threshold = 0.8 } = {}) {
  try {
    if (dedupKey(a.url) === dedupKey(b.url)) return true;
    if (siteOf(a.url) !== siteOf(b.url)) return false;
  } catch { return false; }
  return titleSimilarity(a.title, b.title) >= threshold;
}

const MH_BANDS = 16;
const MH_ROWS = 4; // 64 hashes; P(candidate | J) = 1-(1-J^4)^16: J=0.8 -> 0.9995, J=0.5 -> 0.64, J=0.3 -> 0.12
const MH_SEEDS = Array.from({ length: MH_BANDS * MH_ROWS }, (_, i) => fnv1a(`seed${i}`));

/** MinHash signature of a shingle set (64 x 32-bit). */
export function minhash(set) {
  // One string hash per shingle, then 64 cheap integer re-hashes (seeded xor + multiply + xorshift,
  // a murmur3-style finaliser) instead of 64 string hashes.
  const sig = new Uint32Array(MH_SEEDS.length).fill(0xffffffff);
  for (const sh of set) {
    const h0 = fnv1a(sh);
    for (let i = 0; i < MH_SEEDS.length; i++) {
      let h = Math.imul(h0 ^ MH_SEEDS[i], 0x85ebca6b);
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
      h >>>= 0;
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

/**
 * Group near-duplicates in a resource list. Returns clusters (arrays of indices, size >= 2),
 * each sorted, the list sorted by first index. Candidate pairs come from (a) identical dedupKey
 * and (b) MinHash-LSH band collisions within the same site, then are confirmed with exact
 * Jaccard. Union-find merges transitive duplicates. Expected O(n) for realistic libraries.
 */
export function findNearDuplicates(resources, { threshold = 0.8 } = {}) {
  const n = resources.length;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };

  const keys = new Array(n);
  const sites = new Array(n);
  const sh = new Array(n);
  const byKey = new Map();
  for (let i = 0; i < n; i++) {
    try { keys[i] = dedupKey(resources[i].url); sites[i] = siteOf(resources[i].url); } catch { keys[i] = `#bad${i}`; sites[i] = `#bad${i}`; }
    const prev = byKey.get(keys[i]);
    if (prev != null) union(prev, i); else byKey.set(keys[i], i);
    sh[i] = shingles(resources[i].title);
  }
  const buckets = new Map();
  const checked = new Set();
  for (let i = 0; i < n; i++) {
    if (!sh[i].size) continue;
    const sig = minhash(sh[i]);
    for (let b = 0; b < MH_BANDS; b++) {
      let h = fnv1a(sites[i], b);
      for (let r = 0; r < MH_ROWS; r++) h = Math.imul(h ^ sig[b * MH_ROWS + r], 0x01000193) >>> 0;
      const bk = `${b}:${h}`;
      const list = buckets.get(bk);
      if (!list) { buckets.set(bk, [i]); continue; }
      for (const j of list) {
        const pk = j * n + i;
        if (checked.has(pk)) continue;
        checked.add(pk);
        if (sites[j] === sites[i] && jaccard(sh[i], sh[j]) >= threshold) union(j, i);
      }
      list.push(i);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return [...groups.values()].filter((g) => g.length > 1).sort((a, b) => a[0] - b[0]);
}
