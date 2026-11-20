/**
 * Adaptive placement (computerised adaptive testing) on a CEFR-mapped logit scale.
 *
 *  Model      Rasch / 1PL IRT: P(correct | θ, b) = c + (1 − c)·σ(θ − b). c = 0 is pure Rasch; the
 *             default c = 0.25 corrects for guessing on 4-option MCQs (a fixed-c 1PL, not a fitted 3PL).
 *  Scale      A1 = −2.5, A2 = −1.5, B1 = −0.5, B2 = 0.5, C1 = 1.5, C2 = 2.5 (one logit per band);
 *             band edges at the midpoints; below −3 = "pre-A1".
 *  Estimate   EAP (expected a posteriori; Bock & Mislevy 1982) on a 121-point grid, prior N(target, 1.25²).
 *             Unlike MLE it is finite for all-correct / all-wrong patterns; posterior SD = standard error.
 *             Per-skill θ uses a prior centred on the overall θ (shrinkage), so 2 answers in a skill
 *             don't swing it to the extremes.
 *  Selection  Maximum Fisher information at the current estimate (Lord 1980), with content
 *             balancing: the next skill is the least-measured one (highest posterior SD, then fewest items).
 *  Stopping   overall SE ≤ seTarget (default 0.6 logits) once every skill has ≥ 1 item and ≥ minItems
 *             answered, or maxItems (default 15), or the bank runs out.
 *  Calibration  item difficulty starts at its CEFR tag; aggregate answers refine it with an Elo
 *             update with decaying K (Pelánek 2016, "Applications of the Elo rating system in adaptive
 *             educational systems"): b ← b − K(n)·(correct − P), K(n) = K0 / (1 + n/20).
 *  Confidence = posterior probability mass inside the reported CEFR band.
 *
 * Everything is pure JSON in/out so a session can be stored at users/{uid}/placement/{EXAM}.
 * @module lib/algo/placement
 */
import { LEVELS, STUDY_SKILLS, clamp, round, fnv1a } from './common.js';

export const THETA = { A1: -2.5, A2: -1.5, B1: -0.5, B2: 0.5, C1: 1.5, C2: 2.5 };
export const DEFAULTS = { maxItems: 15, minItems: 6, seTarget: 0.6, guess: 0.25, priorSd: 1.25, skillPriorSd: 0.9 };
const GRID = Array.from({ length: 121 }, (_, i) => -6 + i * 0.1);

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const pCorrect = (theta, b, c = DEFAULTS.guess) => c + (1 - c) * sigmoid(theta - b);

/** Fisher information of a fixed-guessing 1PL item at θ: (P')² / (P(1−P)). With c = 0 this is P(1−P). */
export function information(theta, b, c = DEFAULTS.guess) {
  const s = sigmoid(theta - b);
  const p = c + (1 - c) * s;
  const dp = (1 - c) * s * (1 - s);
  return (dp * dp) / (p * (1 - p));
}

export const difficultyOf = (item) => (typeof item?.b === 'number' && Number.isFinite(item.b) ? item.b : THETA[item?.cefr] ?? 0);

/** θ -> CEFR band name ('pre-A1' below A1). */
export function thetaToLevel(theta) {
  if (theta < -3) return 'pre-A1';
  for (let i = 0; i < LEVELS.length; i++) if (theta < THETA[LEVELS[i]] + 0.5) return LEVELS[i];
  return 'C2';
}
const bandEdges = (lv) => (lv === 'pre-A1' ? [-Infinity, -3] : [THETA[lv] - 0.5, lv === 'C2' ? Infinity : THETA[lv] + 0.5]);

/**
 * EAP estimate from responses [{b, correct}] with a normal prior.
 * @returns {{theta: number, se: number, level: string, confidence: number}}
 */
export function eap(responses, { priorMean = 0, priorSd = DEFAULTS.priorSd, guess = DEFAULTS.guess } = {}) {
  const logPost = GRID.map((t) => {
    let lp = -0.5 * ((t - priorMean) / priorSd) ** 2;
    for (const r of responses) { const p = pCorrect(t, r.b, guess); lp += Math.log(r.correct ? p : 1 - p); }
    return lp;
  });
  const mx = Math.max(...logPost);
  const w = logPost.map((x) => Math.exp(x - mx));
  const Z = w.reduce((a, b) => a + b, 0);
  let mean = 0;
  for (let i = 0; i < GRID.length; i++) mean += GRID[i] * w[i];
  mean /= Z;
  let v = 0;
  for (let i = 0; i < GRID.length; i++) v += (GRID[i] - mean) ** 2 * w[i];
  const se = Math.sqrt(v / Z);
  const level = thetaToLevel(mean);
  const [lo, hi] = bandEdges(level);
  let mass = 0;
  for (let i = 0; i < GRID.length; i++) if (GRID[i] >= lo && GRID[i] < hi) mass += w[i];
  return { theta: round(mean, 3), se: round(se, 3), level, confidence: round(mass / Z, 3) };
}

/** Start an adaptive session (plain JSON). */
export function createSession({ exam, targetLevel, skills = STUDY_SKILLS, seed = '', ...opts }) {
  if (!LEVELS.includes(targetLevel)) throw new Error('createSession: bad targetLevel');
  const o = { ...DEFAULTS, ...opts };
  return {
    v: 1, exam: exam || null, targetLevel, skills: skills.filter((s) => STUDY_SKILLS.includes(s)),
    seed: String(seed), opts: { maxItems: o.maxItems, minItems: o.minItems, seTarget: o.seTarget, guess: o.guess, priorSd: o.priorSd, skillPriorSd: o.skillPriorSd },
    responses: [], done: false, stopReason: null
  };
}

/** Overall and per-skill estimates for a session. */
export function estimate(session) {
  const o = session.opts;
  const prior = THETA[session.targetLevel];
  const overall = eap(session.responses, { priorMean: prior, priorSd: o.priorSd, guess: o.guess });
  const perSkill = {};
  for (const s of session.skills) {
    const rs = session.responses.filter((r) => r.skill === s);
    const e = eap(rs, { priorMean: overall.theta, priorSd: o.skillPriorSd, guess: o.guess });
    perSkill[s] = { ...e, items: rs.length, score: round(sigmoid(e.theta - prior), 3) };
  }
  return { ...overall, items: session.responses.length, perSkill };
}

/** Should the session stop? Returns a reason string or null. */
export function stopReason(session, bankLeft = Infinity) {
  const o = session.opts;
  const n = session.responses.length;
  if (n >= o.maxItems) return 'max_items';
  if (bankLeft <= 0) return 'bank_exhausted';
  if (n < o.minItems) return null;
  const covered = session.skills.every((s) => session.responses.some((r) => r.skill === s));
  if (!covered) return null;
  return estimate(session).se <= o.seTarget ? 'se_target' : null;
}

/**
 * Pick the next item from `bank` ([{id, skill, cefr, b?}]) or null when the session should stop.
 * Deterministic: ties broken by hash(seed + id).
 */
export function nextItem(session, bank) {
  const used = new Set(session.responses.map((r) => r.id));
  const avail = (bank || []).filter((it) => it && !used.has(it.id) && session.skills.includes(it.skill));
  const why = stopReason(session, avail.length);
  if (why) return null;
  const est = estimate(session);
  const skillsWithItems = session.skills.filter((s) => avail.some((it) => it.skill === s));
  // Content balancing: least-measured skill first.
  const skill = skillsWithItems.sort((a, b) => est.perSkill[a].items - est.perSkill[b].items || est.perSkill[b].se - est.perSkill[a].se || session.skills.indexOf(a) - session.skills.indexOf(b))[0];
  const theta = est.perSkill[skill]?.items ? est.perSkill[skill].theta : est.theta;
  let best = null; let bestI = -1; let bestTie = 0;
  for (const it of avail) {
    if (it.skill !== skill) continue;
    const I = information(theta, difficultyOf(it), session.opts.guess);
    const tie = fnv1a(`${session.seed}:${it.id}`);
    if (I > bestI + 1e-12 || (Math.abs(I - bestI) <= 1e-12 && tie < bestTie)) { best = it; bestI = I; bestTie = tie; }
  }
  return best;
}

/** Record an answer (returns a NEW session; input not mutated). */
export function recordAnswer(session, item, correct) {
  if (!item || typeof correct !== 'boolean') throw new Error('recordAnswer: item and boolean correct required');
  if (session.responses.some((r) => r.id === item.id)) return session;
  const next = { ...session, responses: [...session.responses, { id: String(item.id), skill: item.skill, b: difficultyOf(item), cefr: item.cefr || null, correct }] };
  const why = stopReason(next);
  return why ? { ...next, done: true, stopReason: why } : next;
}

/** Final report in the shape the client already understands (skillScores 0..1 + estimatedLevel). */
export function report(session) {
  const e = estimate(session);
  return {
    method: 'irt_eap',
    estimatedLevel: e.level,
    confidence: e.confidence,
    theta: e.theta,
    se: e.se,
    items: e.items,
    skillScores: Object.fromEntries(Object.entries(e.perSkill).filter(([, v]) => v.items > 0).map(([k, v]) => [k, v.score])),
    perSkill: e.perSkill,
    stopReason: session.stopReason
  };
}

/**
 * Non-adaptive mode: score a fixed quiz (e.g. today's 12 questions, each tagged cefr) with the
 * same IRT model. Answers: [{id, skill, cefr, correct}]. Compatible with scoreDiagnostic's output.
 */
export function scoreFixed({ targetLevel, answers, guess = DEFAULTS.guess }) {
  let s = createSession({ targetLevel, skills: [...new Set(answers.map((a) => a.skill).filter((x) => STUDY_SKILLS.includes(x)))], guess, maxItems: 1e9, minItems: 1e9 });
  for (const a of answers) s = recordAnswer(s, { id: a.id, skill: a.skill, cefr: a.cefr || targetLevel, b: a.b }, Boolean(a.correct));
  return report({ ...s, stopReason: 'fixed_form' });
}

/**
 * Elo calibration step for one answer (Pelánek 2016). Returns new {b, n} for the item and the
 * learner's updated θ (useful for ongoing practice). Batch these in the nightly calibration job.
 */
export function eloUpdate({ theta, b, n = 0, correct, guess = DEFAULTS.guess, K0 = 0.4, Kl = 0.3 }) {
  const p = pCorrect(theta, b, guess);
  const err = (correct ? 1 : 0) - p;
  const Kb = K0 / (1 + n / 20);
  return { b: round(clamp(b - Kb * err, -4, 4), 4), n: n + 1, theta: round(clamp(theta + Kl * err, -6, 6), 4), p: round(p, 4) };
}
