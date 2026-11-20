/**
 * Pace & readiness model (deterministic; the coach agent only explains these numbers).
 *
 *  Expected progress  share of planned task-minutes scheduled up to the current day (from the
 *                     schedule calendar when given, otherwise linear days-elapsed / days).
 *  Pace               EWMA of completed tasks per day (Roberts 1959 exponentially weighted moving
 *                     average), α = 2/(N+1) with N = 7, seeded with the planned rate so a new plan
 *                     doesn't start at 0.
 *  Projection         finish day = today + remaining / pace (null when pace ≈ 0).
 *  Readiness / skill  weighted blend of: placement ability (σ(θ − b_target), from placement.js),
 *                     completion share of that skill's planned tasks, SRS retention (srs.js);
 *                     weights 0.45 / 0.35 / 0.20, re-normalised over the components that exist.
 *                     Overall readiness is weighted by the exam's section weights.
 *  On-track           Schmitt-trigger hysteresis (two thresholds), so the label doesn't flip-flop
 *                     day to day: on-track -> behind when gap < −0.15 or the projected finish is
 *                     > 3 days late; behind -> on-track only when gap ≥ −0.05 and projection ≤ deadline.
 *  Warm-up            the first WARMUP_DAYS days have too little history for a pace projection
 *                     (one day of zero ticks would read as "11 days late"): no projection, on-track
 *                     uses the gap rule only, and with nothing ticked yet the result is neutral
 *                     (insufficientHistory: true, onTrack: true).
 *
 * @module lib/algo/progress
 */
import { STUDY_SKILLS, DAY_MS, clamp, round, toMillis } from './common.js';

export const EWMA_N = 7;
export const ENTER_BEHIND_GAP = -0.15;
export const EXIT_BEHIND_GAP = -0.05;
export const LATE_DAYS = 3;
export const WARMUP_DAYS = 3;
export const READINESS_WEIGHTS = { ability: 0.45, completion: 0.35, retention: 0.2 };

/** EWMA over a daily series. Returns the final smoothed value. */
export function ewma(series, { n = EWMA_N, seed = null } = {}) {
  const a = 2 / (n + 1);
  let v = seed ?? (series.length ? series[0] : 0);
  for (let i = seed == null ? 1 : 0; i < series.length; i++) v = a * series[i] + (1 - a) * v;
  return v;
}

/** Completed tasks per plan day 1..upTo from completion timestamps (ms/ISO/Timestamp). */
export function dailyCounts(completedAt, startMs, upTo) {
  const out = new Array(Math.max(0, upTo)).fill(0);
  for (const t of completedAt || []) {
    const ms = toMillis(t);
    if (ms == null) continue;
    const d = Math.floor((ms - startMs) / DAY_MS);
    if (d >= 0 && d < upTo) out[d]++;
  }
  return out;
}

/** Expected completed share after `day` days. Uses calendar task counts when available. */
export function expectedShare(day, days, calendar = null) {
  if (day <= 0) return 0;
  if (day >= days) return 1;
  if (Array.isArray(calendar) && calendar.length) {
    let tot = 0; let upto = 0;
    const full = Math.floor(day); const frac = day - full;
    for (const c of calendar) {
      const n = (c.tasks || []).length || 1;
      tot += n;
      if (c.day <= full) upto += n; else if (c.day === full + 1) upto += frac * n;
    }
    return tot ? upto / tot : day / days;
  }
  return day / days;
}

/**
 * @param {object} p
 * @param {number} p.days            plan length
 * @param {string|number} p.startDate plan start (YYYY-MM-DD or ms)
 * @param {number} [p.now]
 * @param {number} p.totalTasks
 * @param {Array} p.completedAt       completion timestamps, one per completed task
 * @param {object[]} [p.calendar]     schedule.js calendar (optional, improves "expected")
 * @param {Record<string,{planned:number, done:number}>} [p.bySkill]
 * @param {Record<string,number>} [p.abilityScores]    placement report().skillScores (0..1)
 * @param {Record<string,number>} [p.retentionBySkill] srs retention().bySkill
 * @param {Record<string,number>} [p.sectionWeights]
 * @param {{onTrack?: boolean}|null} [p.previous]       last stored decision (hysteresis)
 */
export function assessProgress(p) {
  const now = p.now ?? Date.now();
  const startMs = typeof p.startDate === 'number' ? p.startDate : Date.parse(`${String(p.startDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(startMs)) throw new Error('assessProgress: bad startDate');
  const days = Math.max(1, Math.round(p.days));
  const total = Math.max(0, Math.round(p.totalTasks || 0));
  const elapsed = clamp(Math.floor((now - startMs) / DAY_MS) + 1, 0, 10000); // day index, 1 = first day
  const dayIdx = Math.min(elapsed, days);
  const done = Math.min(total, (p.completedAt || []).length);
  const remaining = total - done;
  const expected = expectedShare(dayIdx - 0.5, days, p.calendar); // expectation at mid-day of today
  const actual = total ? done / total : 1;
  const gap = actual - expected;

  const plannedRate = total / days;
  // Pace uses every elapsed day (also after the planned end), so a stalled plan decays to ~0.
  const seen = Math.max(1, elapsed);
  const counts = dailyCounts(p.completedAt, startMs, seen);
  const pace = ewma(counts, { seed: plannedRate });
  const remainingDays = Math.max(0, days - dayIdx);
  const earlyDays = elapsed < WARMUP_DAYS;
  const insufficientHistory = remaining > 0 && earlyDays && done === 0;
  let projectedFinishDay = null;
  if (remaining === 0) projectedFinishDay = Math.min(dayIdx, days);
  else if (!earlyDays && pace >= 0.01) projectedFinishDay = seen + Math.ceil(remaining / pace);
  const lateBy = projectedFinishDay == null ? Infinity : projectedFinishDay - days;
  const requiredPace = remaining ? remaining / Math.max(1, remainingDays + 1) : 0;

  const prevOn = p.previous?.onTrack ?? true;
  let onTrack;
  if (remaining === 0 || insufficientHistory) onTrack = true;
  else if (earlyDays) onTrack = prevOn ? gap >= ENTER_BEHIND_GAP : gap >= EXIT_BEHIND_GAP;
  else if (prevOn) onTrack = !(gap < ENTER_BEHIND_GAP || lateBy > LATE_DAYS);
  else onTrack = gap >= EXIT_BEHIND_GAP && lateBy <= 0;

  const readiness = readinessScores(p);
  return {
    day: dayIdx, days, done, total, remaining,
    expectedPct: round(expected * 100, 1), actualPct: round(actual * 100, 1), gapPct: round(gap * 100, 1),
    pace: round(pace, 3), plannedPace: round(plannedRate, 3), requiredPace: round(requiredPace, 3),
    projectedFinishDay, projectedFinishDate: projectedFinishDay == null ? null : new Date(startMs + (projectedFinishDay - 1) * DAY_MS).toISOString().slice(0, 10),
    lateByDays: Number.isFinite(lateBy) ? lateBy : null,
    onTrack, changed: onTrack !== prevOn, insufficientHistory,
    readiness
  };
}

/** Per-skill and overall readiness in [0,1]. */
export function readinessScores({ bySkill = {}, abilityScores = {}, retentionBySkill = {}, sectionWeights = null }) {
  const perSkill = {};
  for (const s of STUDY_SKILLS) {
    const parts = [];
    if (typeof abilityScores[s] === 'number') parts.push(['ability', clamp(abilityScores[s], 0, 1)]);
    const b = bySkill[s];
    if (b && b.planned > 0) parts.push(['completion', clamp(b.done / b.planned, 0, 1)]);
    if (typeof retentionBySkill[s] === 'number') parts.push(['retention', clamp(retentionBySkill[s], 0, 1)]);
    if (!parts.length) continue;
    const wsum = parts.reduce((a, [k]) => a + READINESS_WEIGHTS[k], 0);
    perSkill[s] = round(parts.reduce((a, [k, v]) => a + READINESS_WEIGHTS[k] * v, 0) / wsum, 3);
  }
  const keys = Object.keys(perSkill);
  let overall = null;
  if (keys.length) {
    const w = (s) => (sectionWeights && typeof sectionWeights[s] === 'number' ? sectionWeights[s] : 1);
    const W = keys.reduce((a, s) => a + w(s), 0);
    overall = W ? round(keys.reduce((a, s) => a + w(s) * perSkill[s], 0) / W, 3) : null;
  }
  const weakest = keys.sort((a, b) => perSkill[a] - perSkill[b] || STUDY_SKILLS.indexOf(a) - STUDY_SKILLS.indexOf(b)).slice(0, 2);
  return { perSkill, overall, weakest };
}
