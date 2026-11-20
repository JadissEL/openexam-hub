/**
 * Progress coach agent — ONE job: tell a learner whether they are on track with a roadmap and,
 * if behind, rebalance ONLY the remaining unfinished tasks into the remaining days.
 *
 *  1. Deterministic: expected = daysElapsed/days, actual = done/total, onTrack = actual >= expected - 0.1.
 *  2. If behind: the LLM (agent COACH) regroups remaining task strings into phases covering the
 *     remaining days. validateRebalance() guarantees: only existing remaining task strings (merges
 *     are "A + B" of existing strings), no completed tasks, at most 20% dropped (never mock exams),
 *     no new resources/URLs, phase days summing exactly to the remaining days.
 *  3. If the LLM fails or keeps producing invalid output: deterministic even-spread fallback.
 *
 * Returns { status, onTrack, expectedPct, actualPct, remainingDays, summary, rebalancedPhases, tips, source }.
 * @module lib/agents/coach
 */
import { BadInput, parseBoundedInt, clean, hasUrl, deps, setLearnerDeps, LEVELS } from './learnerShared.js';

export { setLearnerDeps as __setTestDeps };

export const ON_TRACK_TOLERANCE = 0.1;
export const MAX_DROP_RATIO = 0.2;
const MERGE_SEP = ' + ';
const MAX_PHASES = 8;
const PROTECTED = /mock|examen blanc|test blanc|simulation|modelltest|probe|practice test|full test|épreuve complète/i;

const norm = (s) => clean(s, 2000).toLowerCase();

// ---------- input ----------
/** Validates and normalises the roadmap (contract shape). Throws BadInput. */
export function parseRoadmap(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new BadInput('roadmap must be an object');
  const days = parseBoundedInt(r.days, { name: 'roadmap.days', min: 1, max: 180 });
  if (!Array.isArray(r.phases) || r.phases.length < 1 || r.phases.length > 20) throw new BadInput('roadmap.phases must be an array of 1..20 phases');
  let total = 0;
  const phases = r.phases.map((p, i) => {
    if (!p || typeof p !== 'object' || !Array.isArray(p.tasks)) throw new BadInput(`roadmap.phases[${i}].tasks must be an array`);
    if (p.tasks.length > 60) throw new BadInput(`roadmap.phases[${i}] has too many tasks`);
    const tasks = p.tasks.map((t, j) => {
      if (typeof t !== 'string' || !t.trim() || t.length > 600) throw new BadInput(`roadmap.phases[${i}].tasks[${j}] must be a non-empty string (<= 600 chars)`);
      return clean(t, 600);
    });
    total += tasks.length;
    return { phaseTitle: clean(p.phaseTitle, 200) || `Phase ${i + 1}`, focus: clean(p.focus, 400), tasks };
  });
  if (total < 1 || total > 400) throw new BadInput('roadmap must contain 1..400 tasks');
  const ct = r.completedTasks ?? {};
  if (typeof ct !== 'object' || Array.isArray(ct)) throw new BadInput('roadmap.completedTasks must be an object keyed "phaseIdx-taskIdx"');
  const completed = new Set();
  for (const [k, v] of Object.entries(ct)) {
    const m = /^(\d+)-(\d+)$/.exec(k);
    if (!m) throw new BadInput(`completedTasks key "${k}" must look like "phaseIdx-taskIdx"`);
    if (v && phases[+m[1]]?.tasks[+m[2]] !== undefined) completed.add(k); // ignore stale keys
  }
  return {
    exam: typeof r.exam === 'string' ? clean(r.exam, 20).toUpperCase() : '',
    level: LEVELS.includes(r.level) ? r.level : '',
    days, phases, completed, total
  };
}

/** Pure progress maths. */
export function computeProgress(rm, daysElapsed) {
  const done = rm.completed.size;
  const expected = Math.min(1, daysElapsed / rm.days);
  const actual = done / rm.total;
  const remaining = [];
  rm.phases.forEach((p, i) => p.tasks.forEach((t, j) => {
    if (!rm.completed.has(`${i}-${j}`)) remaining.push({ task: t, phaseIdx: i, phaseTitle: p.phaseTitle, focus: p.focus });
  }));
  return {
    done, expected, actual,
    onTrack: actual >= expected - ON_TRACK_TOLERANCE || remaining.length === 0,
    remaining,
    remainingDays: Math.max(1, rm.days - daysElapsed),
    pastEnd: daysElapsed >= rm.days
  };
}

// ---------- LLM output validation ----------
const PHASE_SCHEMA = {
  type: 'object',
  properties: {
    phaseTitle: { type: 'string' },
    focus: { type: 'string' },
    days: { type: 'integer', minimum: 1 },
    tasks: { type: 'array', items: { type: 'string' } }
  },
  required: ['phaseTitle', 'focus', 'days', 'tasks']
};
const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    phases: { type: 'array', items: PHASE_SCHEMA },
    dropped: { type: 'array', items: { type: 'string' } },
    tips: { type: 'array', items: { type: 'string' }, maxItems: 5 }
  },
  required: ['summary', 'phases', 'dropped', 'tips']
};

/**
 * Error string or null. `remaining` / `completed` are arrays of task strings (duplicates allowed).
 * Each output task must be one remaining task, or several joined with " + " (a merge). Every
 * remaining task must be used exactly once or listed in `dropped`.
 */
export function validateRebalance(data, { remaining, completed = [], remainingDays }) {
  if (!data || typeof data !== 'object') return 'Output must be an object.';
  if (typeof data.summary !== 'string' || !clean(data.summary)) return '"summary" is missing.';
  if (!Array.isArray(data.phases) || !data.phases.length) return '"phases" must be a non-empty array.';
  if (data.phases.length > Math.min(MAX_PHASES, remainingDays)) return `Use at most ${Math.min(MAX_PHASES, remainingDays)} phases.`;
  if (!Array.isArray(data.dropped)) return '"dropped" must be an array (may be empty).';
  if (!Array.isArray(data.tips)) return '"tips" must be an array.';
  if (data.tips.some((t) => typeof t !== 'string' || hasUrl(t)) || hasUrl(data.summary)) return 'summary/tips must be plain strings without URLs or websites.';

  const pool = new Map(); // norm(task) -> remaining count
  for (const t of remaining) pool.set(norm(t), (pool.get(norm(t)) || 0) + 1);
  const completedSet = new Set(completed.map(norm));
  const take = (t, where) => {
    const k = norm(t);
    if (!k) return `${where}: empty task.`;
    if (!pool.has(k)) {
      if (completedSet.has(k)) return `${where}: "${t.slice(0, 80)}" is already completed — do not include completed tasks.`;
      if (hasUrl(t)) return `${where}: "${t.slice(0, 80)}" adds a URL/resource that is not in the remaining tasks.`;
      return `${where}: "${t.slice(0, 80)}" is not one of the remaining tasks. Use the exact task strings only.`;
    }
    if (pool.get(k) === 0) return `${where}: "${t.slice(0, 80)}" is used more than once.`;
    pool.set(k, pool.get(k) - 1);
    return null;
  };

  let daySum = 0;
  for (const [i, p] of data.phases.entries()) {
    const where = `phases[${i}]`;
    if (!p || typeof p !== 'object') return `${where} is not an object.`;
    if (typeof p.phaseTitle !== 'string' || !clean(p.phaseTitle)) return `${where}.phaseTitle is missing.`;
    if (typeof p.focus !== 'string') return `${where}.focus must be a string.`;
    if (hasUrl(p.phaseTitle) || hasUrl(p.focus)) return `${where} title/focus must not contain URLs.`;
    if (!Number.isInteger(p.days) || p.days < 1) return `${where}.days must be an integer >= 1.`;
    daySum += p.days;
    if (!Array.isArray(p.tasks) || !p.tasks.length) return `${where}.tasks must be a non-empty array.`;
    for (const [j, t] of p.tasks.entries()) {
      if (typeof t !== 'string') return `${where}.tasks[${j}] must be a string.`;
      const parts = norm(t) && !pool.has(norm(t)) && t.includes(MERGE_SEP) ? t.split(MERGE_SEP) : [t];
      for (const part of parts) {
        const err = take(part, `${where}.tasks[${j}]`);
        if (err) return err;
      }
    }
  }
  if (daySum !== remainingDays) return `Phase "days" must add up to exactly ${remainingDays} (got ${daySum}).`;

  let droppedCount = 0;
  for (const [i, t] of data.dropped.entries()) {
    if (typeof t !== 'string') return `dropped[${i}] must be a string.`;
    if (PROTECTED.test(t)) return `dropped[${i}]: mock exams / full tests must not be dropped.`;
    const err = take(t, `dropped[${i}]`);
    if (err) return err;
    droppedCount++;
  }
  const maxDrop = Math.floor(remaining.length * MAX_DROP_RATIO);
  if (droppedCount > maxDrop) return `At most ${maxDrop} low-priority tasks may be dropped (got ${droppedCount}).`;
  const missing = [...pool.entries()].filter(([, n]) => n > 0);
  if (missing.length) return `Every remaining task must be scheduled once or listed in "dropped"; missing e.g. "${missing[0][0].slice(0, 80)}".`;
  return null;
}

/** Map validated output back to canonical task strings and add day ranges. */
function canonicalPhases(data, remaining, startDay) {
  const canon = new Map();
  for (const t of remaining) if (!canon.has(norm(t))) canon.set(norm(t), t);
  let day = startDay;
  return data.phases.map((p) => {
    const tasks = p.tasks.map((t) => (canon.has(norm(t)) ? canon.get(norm(t)) : t.split(MERGE_SEP).map((x) => canon.get(norm(x))).join(MERGE_SEP)));
    const out = { phaseTitle: clean(p.phaseTitle, 200), focus: clean(p.focus, 400), days: p.days, dayStart: day, dayEnd: day + p.days - 1, tasks };
    day += p.days;
    return out;
  });
}

/** Deterministic fallback: keep order, spread remaining tasks and remaining days evenly. */
export function fallbackRebalance(remaining, remainingDays, startDay = 1) {
  if (!remaining.length) return [];
  const origPhases = new Set(remaining.map((r) => r.phaseIdx)).size;
  const k = Math.max(1, Math.min(remainingDays, remaining.length, Math.max(origPhases, 1), MAX_PHASES));
  const split = (n, parts) => Array.from({ length: parts }, (_, i) => Math.floor(n / parts) + (i < n % parts ? 1 : 0));
  const taskCounts = split(remaining.length, k);
  const dayCounts = split(remainingDays, k);
  const phases = [];
  let ti = 0;
  let day = startDay;
  for (let i = 0; i < k; i++) {
    const chunk = remaining.slice(ti, ti + taskCounts[i]);
    ti += taskCounts[i];
    const first = chunk[0];
    phases.push({
      phaseTitle: `Catch-up ${i + 1}: ${first.phaseTitle}`.slice(0, 200),
      focus: first.focus,
      days: dayCounts[i],
      dayStart: day,
      dayEnd: day + dayCounts[i] - 1,
      tasks: chunk.map((c) => c.task)
    });
    day += dayCounts[i];
  }
  return phases;
}

const pct = (x) => Math.round(x * 100);

/** Main entry. Throws BadInput on bad input; never throws on LLM failure. */
export async function coachProgress(input) {
  const rm = parseRoadmap(input?.roadmap);
  const daysElapsed = parseBoundedInt(input?.daysElapsed, { name: 'daysElapsed', min: 0, max: rm.days });
  const p = computeProgress(rm, daysElapsed);
  const base = { status: 'ok', onTrack: p.onTrack, expectedPct: pct(p.expected), actualPct: pct(p.actual), remainingDays: p.remainingDays, daysElapsed };

  if (p.onTrack) {
    return {
      ...base,
      summary: p.remaining.length
        ? `On track: ${pct(p.actual)}% of tasks done vs ${pct(p.expected)}% of the time used. Keep the current plan.`
        : 'All tasks are done. Use the remaining days for timed mock exams and review.',
      rebalancedPhases: [],
      tips: p.remaining.length
        ? ['Keep a fixed daily study slot.', 'Tick tasks off as you go so the coach can track you.', 'Do one timed practice section each week.']
        : ['Re-do a full timed mock exam.', 'Review your error notes.'],
      source: 'deterministic'
    };
  }

  const startDay = daysElapsed + 1;
  const remainingStrs = p.remaining.map((r) => r.task);
  const completedStrs = [...rm.completed].map((k) => { const [i, j] = k.split('-').map(Number); return rm.phases[i].tasks[j]; });
  const behindBy = pct(p.expected - p.actual);
  const lead = `Behind by about ${behindBy} points (${pct(p.actual)}% done vs ${pct(p.expected)}% expected).${p.pastEnd ? ' The planned end date has passed; the plan below assumes one extra day — consider a later exam date.' : ''}`;

  try {
    const d = await deps();
    const ctx = { remaining: remainingStrs, completed: completedStrs, remainingDays: p.remainingDays };
    const { data } = await d.generateJson({
      agent: 'COACH',
      system: [
        'You are a study coach rebalancing a learner\'s remaining exam-prep tasks.',
        'Rules: use ONLY the exact remaining task strings given (copy them verbatim).',
        `You may reorder them, merge 2–3 related tasks into one entry by joining exact strings with "${MERGE_SEP}",`,
        `and drop at most ${Math.floor(remainingStrs.length * MAX_DROP_RATIO)} low-priority tasks by listing them verbatim in "dropped". Never drop mock exams.`,
        'Never add new tasks, resources, websites or URLs. Never include completed tasks.',
        `Group tasks into at most ${Math.min(MAX_PHASES, p.remainingDays)} phases whose integer "days" add up to exactly ${p.remainingDays}.`,
        'Give 2–4 short practical tips (no links) and a one-sentence encouraging summary.'
      ].join('\n'),
      prompt: JSON.stringify({
        exam: rm.exam || undefined,
        level: rm.level || undefined,
        remainingDays: p.remainingDays,
        progress: { expectedPct: pct(p.expected), actualPct: pct(p.actual) },
        remainingTasks: p.remaining.map((r) => ({ task: r.task, originalPhase: r.phaseTitle }))
      }),
      schema: SCHEMA,
      temperature: 0.2,
      validate: (x) => validateRebalance(x, ctx)
    });
    return {
      ...base,
      summary: `${lead} ${clean(data.summary, 400)}`.trim(),
      rebalancedPhases: canonicalPhases(data, remainingStrs, startDay),
      dropped: data.dropped.map((t) => clean(t, 600)),
      tips: data.tips.map((t) => clean(t, 300)).filter(Boolean).slice(0, 5),
      source: 'llm'
    };
  } catch (err) {
    return {
      ...base,
      summary: `${lead} Remaining tasks were spread evenly over the remaining ${p.remainingDays} day(s).`,
      rebalancedPhases: fallbackRebalance(p.remaining, p.remainingDays, startDay),
      dropped: [],
      tips: ['Add one extra short session on weekends to catch up.', 'Start each day with the oldest unfinished task.', 'Keep the mock exams — they matter most near the end.'],
      source: 'fallback',
      llmError: clean(err?.message || String(err), 200)
    };
  }
}
