/**
 * Shared pure helpers for lib/algo/* (no I/O, no dependencies, no Firestore).
 * Everything here is deterministic: no randomness, and clocks are passed in by the caller.
 * @module lib/algo/common
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
/** The six study skills (same names as lib/agents/learnerShared.js LEARNER_SKILLS). */
export const STUDY_SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'];
/** Full library vocabulary (same order as lib/library.js SKILLS). Index = bit position in skill masks. */
export const ALL_SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary', 'mock_exam', 'exam_format'];
export const DAY_MS = 864e5;

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const round = (x, dp = 3) => { const f = 10 ** dp; return Math.round(x * f) / f; };
export const levelIndex = (l) => LEVELS.indexOf(String(l || '').toUpperCase());

/** Milliseconds from a Firestore Timestamp, Date, ISO string or number; null if unknown. */
export function toMillis(t) {
  if (t == null) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t === 'string') { const v = Date.parse(t); return Number.isNaN(v) ? null : v; }
  if (typeof t._seconds === 'number') return t._seconds * 1000; // serialised admin Timestamp
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return null;
}

/** FNV-1a 32-bit hash of a string (Fowler–Noll–Vo). Optional seed for independent hash families. */
export function fnv1a(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Bit count of a 32-bit int (Hamming weight). */
export function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Skill list -> bitmask over ALL_SKILLS (unknown names ignored). */
export function skillMask(skills) {
  let m = 0;
  if (Array.isArray(skills)) for (const s of skills) { const i = ALL_SKILLS.indexOf(s); if (i >= 0) m |= 1 << i; }
  return m;
}

/**
 * Largest-remainder (Hamilton / Hare–Niemeyer) apportionment of `total` integer seats
 * by non-negative `weights`, with optional per-entry minimum and maximum.
 * Deterministic tie-break: larger remainder, then larger weight, then lower index.
 * O(n log n). Returns integer array summing to `total` (when feasible under min/max).
 */
export function largestRemainder(weights, total, { min = null, max = null } = {}) {
  const n = weights.length;
  const out = new Array(n).fill(0);
  if (!n || total <= 0) return out;
  const lo = weights.map((_, i) => (min ? Math.max(0, min[i] | 0) : 0));
  const hi = weights.map((_, i) => (max ? Math.max(lo[i], max[i]) : Infinity));
  let left = total;
  for (let i = 0; i < n; i++) { out[i] = lo[i]; left -= lo[i]; }
  if (left < 0) {
    // Minimums exceed total: hand out by weight order instead.
    out.fill(0);
    const order = weights.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; k < total; k++) out[order[k % n][1]]++;
    return out;
  }
  // Iterate because caps (hi) can bind and force redistribution of the surplus.
  for (let guard = 0; left > 0 && guard < n + 1; guard++) {
    const open = [];
    for (let i = 0; i < n; i++) if (out[i] < hi[i] && weights[i] > 0) open.push(i);
    if (!open.length) {
      for (let i = 0; i < n && left > 0; i++) if (out[i] < hi[i]) { const add = Math.min(left, hi[i] - out[i]); out[i] += add; left -= add; }
      break;
    }
    const W = open.reduce((a, i) => a + weights[i], 0);
    const quota = open.map((i) => (weights[i] / W) * left);
    const floor = quota.map((q, k) => Math.min(Math.floor(q), hi[open[k]] - out[open[k]]));
    let given = 0;
    open.forEach((i, k) => { out[i] += floor[k]; given += floor[k]; });
    let rest = left - given;
    const order = open
      .map((i, k) => [quota[k] - Math.floor(quota[k]), weights[i], i])
      .sort((a, b) => b[0] - a[0] || b[1] - a[1] || a[2] - b[2]);
    for (const [, , i] of order) { if (rest <= 0) break; if (out[i] < hi[i]) { out[i]++; rest--; } }
    left = rest;
  }
  return out;
}

/** Stable sort helper: sorts a copy by comparator, ties broken by original index. */
export function stableSorted(arr, cmp) {
  return arr.map((v, i) => [v, i]).sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1]).map((x) => x[0]);
}

/** Registrable-ish site key (last two labels, or three for co.uk-style). Used for diversity. */
export function siteOf(raw) {
  let host;
  try { host = new URL(raw).hostname.toLowerCase(); } catch { return ''; }
  const p = host.replace(/\.$/, '').split('.');
  if (p.length <= 2) return p.join('.');
  const sld = p[p.length - 2];
  return (sld.length <= 3 && /^(co|ac|gov|org|com|net|edu)$/.test(sld) ? p.slice(-3) : p.slice(-2)).join('.');
}
