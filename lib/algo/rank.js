/**
 * Resource ranking for an (exam, level, skill) request. Pure, deterministic, O(n·k) with k ≤ ~40.
 *
 * relevance(r) = Σ w_i · f_i(r), each f_i in [0,1]:
 *   level    exact CEFR tag 1 · untagged ("all levels") 0.7 · ±1 band 0.6 · ±2 bands 0.25 · else excluded
 *   skill    requested skill tagged 1 · exam_format/mock_exam 0.35 · other 0.1; with weights: Σ weights of tags (max-normalised)
 *   tier     officialness: this exam's board 1 · another exam board 0.85 · public broadcaster 0.75 · other allowlisted 0.6
 *   health   link status base (ok 1, unverified 0.65, error 0.3) shrunk toward 0.5 with half-life decay since lastCheckedAt
 *            (exponential decay of evidence, H = 30 days) — a link checked 3 months ago is "probably fine", not "fine"
 *   quality  Bayesian average of completion rate: (completions + m·p0)/(uses + m), m = 10, p0 = 0.5, so new items start
 *            at the prior instead of being buried (cf. IMDb-style weighted rating); Wilson lower bound is exported for admin views
 * then Maximal Marginal Relevance (Carbonell & Goldstein 1998) picks k items:
 *   argmax  λ·rel(r) − (1−λ)·max_{s∈S} sim(r,s),   sim = 0.6·[same site] + 0.4·Jaccard(skills)
 * plus a soft per-site cap (relaxed only when nothing else is left), so a plan is never 5 links from one site.
 * Ties break on id, so output is fully deterministic.
 *
 * @module lib/algo/rank
 */
import { LEVELS, ALL_SKILLS, DAY_MS, clamp, round, levelIndex, toMillis, skillMask, popcount, siteOf } from './common.js';
import { EXAM_BOARDS } from '../exams.js';

export const WEIGHTS = { level: 0.25, skill: 0.25, tier: 0.2, health: 0.15, quality: 0.15 };
export const HEALTH_HALF_LIFE_DAYS = 30;
export const PRIOR_M = 10;
export const PRIOR_P = 0.5;

/** Exam board sites per exam (tier 1 for that exam). Sourced from lib/exams.js. */
export { EXAM_BOARDS };
const ALL_BOARDS = new Set(Object.values(EXAM_BOARDS).flat());
export const BROADCASTERS = new Set(['tv5monde.com', 'rfi.fr', 'dw.com', 'bbc.co.uk', 'arte.tv', 'radiofrance.fr']);

/** Officialness tier score for a URL given the requested exam. */
export function tierScore(url, exam) {
  const site = siteOf(url);
  if ((EXAM_BOARDS[exam] || []).includes(site)) return 1;
  if (ALL_BOARDS.has(site)) return 0.85;
  if (BROADCASTERS.has(site)) return 0.75;
  return 0.6;
}

export function levelScore(levels, level) {
  if (!Array.isArray(levels) || !levels.length) return 0.7;
  const t = levelIndex(level);
  let best = Infinity;
  for (const l of levels) { const i = levelIndex(l); if (i >= 0) best = Math.min(best, Math.abs(i - t)); }
  return best === 0 ? 1 : best === 1 ? 0.6 : best === 2 ? 0.25 : 0;
}

const LINK_BASE = { ok: 1, unverified: 0.65, error: 0.3 };
/** Link health in [0,1] with evidence decay; null = excluded (dead/off_allowlist/unknown status). */
export function healthScore(linkStatus, lastCheckedAt, now) {
  const base = LINK_BASE[linkStatus];
  if (base == null) return null;
  const t = toMillis(lastCheckedAt);
  const ageDays = t == null ? Infinity : Math.max(0, (now - t) / DAY_MS);
  const keep = Number.isFinite(ageDays) ? 2 ** (-ageDays / HEALTH_HALF_LIFE_DAYS) : 0;
  return 0.5 + (base - 0.5) * keep;
}

/** Bayesian average completion rate (successes/trials shrunk to prior p0 with weight m). */
export function bayesianRate(successes, trials, m = PRIOR_M, p0 = PRIOR_P) {
  const s = Math.max(0, Number(successes) || 0);
  const n = Math.max(s, Number(trials) || 0);
  return (s + m * p0) / (n + m);
}

/** Wilson score interval lower bound (95 %, z = 1.96). 0 when n = 0. */
export function wilsonLowerBound(successes, trials, z = 1.96) {
  const n = Math.max(0, Number(trials) || 0);
  if (!n) return 0;
  const p = clamp((Number(successes) || 0) / n, 0, 1);
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

const MOCK_BIT = 1 << ALL_SKILLS.indexOf('mock_exam');
const FMT_BIT = 1 << ALL_SKILLS.indexOf('exam_format');

/**
 * Score one resource (no diversity). Returns null when it must be excluded.
 * @param {object} r library resource
 * @param {{exam: string, level: string, skill?: string|null, skillWeights?: Record<string,number>|null}} q
 */
export function scoreResource(r, q, now, weights = WEIGHTS) {
  if (!r || !r.url || !r.id) return null;
  if (r.approved === false) return null;
  if (Array.isArray(r.exams) && r.exams.length && !r.exams.includes(q.exam)) return null;
  const lv = levelScore(r.levels, q.level);
  if (lv === 0) return null;
  const health = healthScore(r.linkStatus ?? 'unverified', r.lastCheckedAt, now);
  if (health == null) return null;
  const mask = skillMask(r.skills);
  let sk;
  if (q.skillWeights) {
    let s = 0; let mx = 0;
    for (const [k, w] of Object.entries(q.skillWeights)) { const i = ALL_SKILLS.indexOf(k); if (i < 0) continue; mx = Math.max(mx, w); if (mask & (1 << i)) s += w; }
    sk = mx > 0 ? clamp(s / mx, 0, 1) : 0.5;
    if (!s && mask & (MOCK_BIT | FMT_BIT)) sk = 0.35;
  } else if (q.skill) {
    const i = ALL_SKILLS.indexOf(q.skill);
    sk = i >= 0 && mask & (1 << i) ? 1 : mask & (MOCK_BIT | FMT_BIT) ? 0.35 : 0.1;
  } else sk = mask ? 0.8 : 0.4;
  const tier = tierScore(r.url, q.exam);
  const quality = bayesianRate(r.completionCount, r.usageCount);
  const comp = { level: lv, skill: sk, tier, health, quality };
  let score = 0;
  for (const k in weights) score += weights[k] * comp[k];
  return { score, comp, mask };
}

/**
 * Rank resources with MMR diversity.
 * @param {object[]} resources
 * @param {{exam: string, level: string, skill?: string|null, skillWeights?: object|null}} query
 * @param {{k?: number, lambda?: number, maxPerSite?: number|null, now?: number, weights?: object}} [opts]
 * @returns {Array<object>} top-k resources (original fields + score, relevance, rank, components)
 */
export function rankResources(resources, query, opts = {}) {
  const q = { exam: String(query.exam || '').toUpperCase(), level: String(query.level || '').toUpperCase(), skill: query.skill || null, skillWeights: query.skillWeights || null };
  if (!LEVELS.includes(q.level)) throw new Error('rankResources: bad level');
  const k = Math.max(0, opts.k ?? 12);
  const lambda = clamp(opts.lambda ?? 0.7, 0, 1);
  const now = opts.now ?? Date.now();
  const maxPerSite = opts.maxPerSite === null ? Infinity : opts.maxPerSite ?? Math.max(2, Math.ceil(k / 4));
  const weights = opts.weights || WEIGHTS;

  // 1) Score + dedupe by id (O(n)).
  const seen = new Set();
  const cand = [];
  for (const r of resources || []) {
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    const s = scoreResource(r, q, now, weights);
    if (!s) continue;
    cand.push({ r, rel: s.score, comp: s.comp, mask: s.mask, site: siteOf(r.url), maxSim: 0 });
  }
  if (!cand.length || !k) return [];
  // Deterministic order: relevance desc, id asc (O(n log n)).
  cand.sort((a, b) => b.rel - a.rel || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0));
  // Only the top M can realistically be picked; bounds MMR to O(M·k) even for huge libraries.
  const M = Math.min(cand.length, Math.max(k * 8, 64));
  const pool = cand.slice(0, M);

  // 2) Greedy MMR with incremental max-similarity (O(M·k)).
  const picked = [];
  const perSite = new Map();
  const used = new Uint8Array(pool.length);
  while (picked.length < Math.min(k, pool.length)) {
    let best = -1; let bestVal = -Infinity; let relaxed = false;
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      for (let i = 0; i < pool.length; i++) {
        if (used[i]) continue;
        const c = pool[i];
        if (pass === 0 && (perSite.get(c.site) || 0) >= maxPerSite) continue;
        const val = lambda * c.rel - (1 - lambda) * c.maxSim;
        if (val > bestVal + 1e-12) { bestVal = val; best = i; }
      }
      if (best < 0) relaxed = true;
    }
    if (best < 0) break;
    used[best] = 1;
    const b = pool[best];
    perSite.set(b.site, (perSite.get(b.site) || 0) + 1);
    picked.push({ c: b, mmr: bestVal, relaxed });
    for (let i = 0; i < pool.length; i++) {
      if (used[i]) continue;
      const c = pool[i];
      const uni = popcount(c.mask | b.mask);
      const js = uni ? popcount(c.mask & b.mask) / uni : 0;
      const sim = 0.6 * (c.site === b.site ? 1 : 0) + 0.4 * js;
      if (sim > c.maxSim) c.maxSim = sim;
    }
  }
  return picked.map(({ c, mmr, relaxed }, i) => ({
    ...c.r,
    rank: i + 1,
    relevance: round(c.rel, 4),
    score: round(mmr, 4),
    components: Object.fromEntries(Object.entries(c.comp).map(([k2, v]) => [k2, round(v, 3)])),
    ...(relaxed ? { siteCapRelaxed: true } : {})
  }));
}

/**
 * Per-skill coverage helper: rank for each skill with weights and merge, guaranteeing at least
 * `perSkill` resources for every requested skill when the library has them. Used to build shelves.
 */
export function rankForPlan(resources, { exam, level, skillWeights }, opts = {}) {
  const k = opts.k ?? 12;
  const base = rankResources(resources, { exam, level, skillWeights }, { ...opts, k });
  const have = new Set(base.map((r) => r.id));
  const out = [...base];
  for (const skill of Object.keys(skillWeights || {})) {
    if (out.some((r) => (r.skills || []).includes(skill))) continue;
    const extra = rankResources(resources, { exam, level, skill }, { ...opts, k: 3 }).find((r) => !have.has(r.id) && (r.skills || []).includes(skill));
    if (extra) { out.push({ ...extra, rank: out.length + 1, addedForCoverage: skill }); have.add(extra.id); }
  }
  return out;
}

/** Compact summary stored on a shelf doc (keeps the doc small: ~250 B per entry). */
export function shelfEntry(r) {
  return {
    id: r.id, url: r.url, title: String(r.title || '').slice(0, 160), category: r.category || 'Study resource',
    skills: r.skills || [], levels: r.levels || [], license: r.license || null,
    linkStatus: r.linkStatus || 'unverified', lastCheckedAt: r.lastCheckedAt ?? null,
    relevance: r.relevance, rank: r.rank
  };
}

/**
 * Adaptive link re-check scheduling (exponential backoff on stable links, fast retry on failures),
 * with deterministic ±10 % jitter by id so the cron load is spread instead of bunching up.
 *   ok:          interval doubles from 7 up to 30 days
 *   unverified:  7 days (bot-blocked pages are re-tried weekly)
 *   error:       1 day, doubling up to 7 (transient errors)
 *   dead:        1 day (so the second strike in linkMaintenance comes quickly)
 * @returns {{nextCheckAt: number (ms), checkIntervalDays: number}}
 */
export function nextLinkCheckAt({ id = '', status, prevIntervalDays = 0, now = Date.now() }) {
  let d;
  if (status === 'ok') d = clamp(Math.max(7, prevIntervalDays * 2), 7, 30);
  else if (status === 'unverified') d = 7;
  else if (status === 'error') d = clamp(Math.max(1, prevIntervalDays * 2), 1, 7);
  else d = 1;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  const jitter = 1 + 0.1 * ((h / 0xffffffff) * 2 - 1);
  return { nextCheckAt: Math.round(now + d * jitter * DAY_MS), checkIntervalDays: d };
}
