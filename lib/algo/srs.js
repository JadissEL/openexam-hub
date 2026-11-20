/**
 * Spaced repetition: a compact FSRS-4.5 scheduler (Free Spaced Repetition Scheduler, Ye et al.,
 * "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling", KDD 2022;
 * open-spaced-repetition/fsrs4anki v4.5 default parameters). Pure: nextReview(state, grade, now).
 *
 *   Retrievability   R(t, S) = (1 + F·t/S)^C,  C = −0.5, F = 19/81   (so R(S, S) = 0.9)
 *   Interval         I(r, S) = S/F · (r^(1/C) − 1)                       (= S when r = 0.9)
 *   First review     S0(G) = w[G−1];  D0(G) = w4 − (G−3)·w5
 *   Difficulty       D' = D − w6·(G−3), mean-reverted: w7·D0(3) + (1−w7)·D', clamped to [1, 10]
 *   Recall (G ≥ 2)   S' = S·(1 + e^w8·(11−D)·S^−w9·(e^(w10·(1−R)) − 1)·hard·easy)
 *   Lapse  (G = 1)   S' = min(S, w11·D^−w12·((S+1)^w13 − 1)·e^(w14·(1−R)))
 * Grades: 1 Again, 2 Hard, 3 Good, 4 Easy. Simplifications vs. full FSRS: no short-term
 * (same-day) stability model; "Again" uses one 10-minute relearning step; optional
 * deterministic fuzz (seeded by card id) instead of random fuzz.
 *
 * @module lib/algo/srs
 */
import { DAY_MS, clamp, round, fnv1a, toMillis } from './common.js';

export const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const GRADES = { again: 1, hard: 2, good: 3, easy: 4 };
const RELEARN_MS = 10 * 60 * 1000;

/** A fresh card state (plain JSON, storable as a Firestore doc). */
export function newCard(id, now = Date.now()) {
  return { id: String(id), state: 'new', due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReview: null };
}

export const retrievabilityAt = (elapsedDays, stability) => (stability > 0 ? (1 + FACTOR * Math.max(0, elapsedDays) / stability) ** DECAY : 0);

/** Probability of recall right now. New cards return 0. */
export function retrievability(card, now = Date.now()) {
  const last = toMillis(card?.lastReview);
  if (!card || card.state === 'new' || last == null || !(card.stability > 0)) return 0;
  return retrievabilityAt((now - last) / DAY_MS, card.stability);
}

/** Interval (days) that brings R down to `requestRetention`. */
export function intervalFor(stability, requestRetention = 0.9) {
  const r = clamp(requestRetention, 0.7, 0.97);
  return (stability / FACTOR) * (r ** (1 / DECAY) - 1);
}

const initD = (g) => W[4] - (g - 3) * W[5];
const clampD = (d) => clamp(d, 1, 10);

function parseGrade(grade) {
  const g = typeof grade === 'string' ? GRADES[grade.toLowerCase()] : grade;
  if (![1, 2, 3, 4].includes(g)) throw new Error('grade must be 1..4 or again|hard|good|easy');
  return g;
}

/**
 * Schedule the next review after answering with `grade` at time `now` (ms).
 * @param {object} card   state from newCard() or a previous nextReview()
 * @param {1|2|3|4|string} grade
 * @param {number} [now]
 * @param {{requestRetention?: number, maximumInterval?: number, fuzz?: boolean}} [opts]
 * @returns {object} new card state (input is not mutated) + {interval (days), retrievability (before review)}
 */
export function nextReview(card, grade, now = Date.now(), opts = {}) {
  const g = parseGrade(grade);
  const reqR = opts.requestRetention ?? 0.9;
  const maxI = opts.maximumInterval ?? 365;
  const c = card && typeof card === 'object' ? card : newCard('x', now);
  let S; let D; let state; let lapses = c.lapses || 0;
  const isNew = c.state === 'new' || !(c.stability > 0);
  const R = isNew ? 0 : retrievability(c, now);
  if (isNew) {
    S = W[g - 1];
    D = clampD(initD(g));
  } else {
    D = clampD(W[7] * initD(3) + (1 - W[7]) * (c.difficulty - W[6] * (g - 3)));
    if (g === 1) {
      S = Math.min(c.stability, W[11] * c.difficulty ** -W[12] * ((c.stability + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R)));
      lapses++;
    } else {
      const hard = g === 2 ? W[15] : 1;
      const easy = g === 4 ? W[16] : 1;
      S = c.stability * (1 + Math.exp(W[8]) * (11 - c.difficulty) * c.stability ** -W[9] * (Math.exp(W[10] * (1 - R)) - 1) * hard * easy);
    }
  }
  S = Math.max(0.01, S);
  let interval; let due;
  if (g === 1) {
    state = isNew ? 'learning' : 'relearning';
    interval = 0;
    due = now + RELEARN_MS;
  } else {
    state = 'review';
    let ivl = clamp(Math.round(intervalFor(S, reqR)), 1, maxI);
    if (opts.fuzz && ivl >= 3) {
      // Deterministic ±5 % spread so cards learned together don't all come due on the same day.
      const u = (fnv1a(`${c.id}:${c.reps || 0}`) / 0xffffffff) * 2 - 1;
      ivl = clamp(Math.round(ivl * (1 + 0.05 * u)), 1, maxI);
    }
    interval = ivl;
    due = now + ivl * DAY_MS;
  }
  return { ...c, state, due, stability: round(S, 4), difficulty: round(D, 4), reps: (c.reps || 0) + 1, lapses, lastReview: now, interval, retrievability: round(R, 4) };
}

/** Preview all four outcomes (for "Again 10m · Hard 2d · Good 4d · Easy 12d" buttons). */
export function previewIntervals(card, now = Date.now(), opts = {}) {
  return Object.fromEntries(Object.entries(GRADES).map(([k, g]) => [k, nextReview(card, g, now, opts).interval]));
}

/** Map a practice answer to a grade: wrong -> Again; right & slow/unsure -> Hard; right -> Good; right & fast -> Easy. */
export function gradeFromAnswer({ correct, confident = true, ms = null, targetMs = 20000 }) {
  if (!correct) return 1;
  if (!confident) return 2;
  if (ms != null && ms < targetMs * 0.4) return 4;
  return 3;
}

/**
 * Due queue: cards with due <= now (plus up to `newLimit` new cards), most-forgotten first
 * (lowest retrievability), ties by due then id. O(n log n).
 */
export function dueQueue(cards, now = Date.now(), { limit = 50, newLimit = 10 } = {}) {
  const due = []; const fresh = [];
  for (const c of cards || []) {
    if (!c) continue;
    if (c.state === 'new') { fresh.push(c); continue; }
    if ((toMillis(c.due) ?? 0) <= now) due.push({ c, r: retrievability(c, now) });
  }
  due.sort((a, b) => a.r - b.r || (toMillis(a.c.due) - toMillis(b.c.due)) || (a.c.id < b.c.id ? -1 : 1));
  fresh.sort((a, b) => (a.id < b.id ? -1 : 1));
  return [...due.map((x) => x.c), ...fresh.slice(0, newLimit)].slice(0, limit);
}

/** Mean retrievability of reviewed cards (optionally per skill via card.skill). Used by progress.js. */
export function retention(cards, now = Date.now()) {
  const by = {}; let sum = 0; let n = 0;
  for (const c of cards || []) {
    if (!c || c.state === 'new') continue;
    const r = retrievability(c, now);
    sum += r; n++;
    if (c.skill) { by[c.skill] ||= { sum: 0, n: 0 }; by[c.skill].sum += r; by[c.skill].n++; }
  }
  return { overall: n ? round(sum / n, 4) : null, bySkill: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, round(v.sum / v.n, 4)])), reviewed: n };
}
