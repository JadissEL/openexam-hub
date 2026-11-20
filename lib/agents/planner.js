/**
 * Pathfinding planner — turns VERIFIED resources into a day-by-day roadmap.
 *
 * The LLM only sees resources as [R1]..[Rn] (title, category, skills; never URLs) and must
 * reference them by index. Its output is then validated and repaired deterministically:
 *   - any URL in task/summary text is stripped,
 *   - [R#] is replaced by the resource title; unknown [R#] references are removed,
 *   - phase count is forced into 3..5 (or fewer when days < 3) by merging/splitting,
 *   - phase day ranges are rebuilt so they cover 1..days exactly, with no gaps or overlaps,
 *   - phase titles are prefixed with "Days a–b:" from the repaired ranges.
 * v3: the orchestrator builds the schedule deterministically (lib/algo/schedule.js) and calls
 * polishPlan(), which only rewrites wording. planRoadmap() is kept for one release.
 * buildFallbackPlan() is now a thin wrapper around buildSchedule().
 *
 * @module lib/agents/planner
 */
import { generateJson, S } from '../llm.js';
import { buildSchedule } from '../algo/schedule.js';

export const MAX_PHASES = 5;
export const MAX_RESOURCES = 12;
const MAX_TASKS = 10;
const MAX_TASK_LEN = 400;
const STUDY_SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'];

const SCHEMA = S.obj({
  summary: S.str,
  phases: S.arr(
    S.obj({
      phaseTitle: S.str,
      focus: S.str,
      startDay: S.int,
      endDay: S.int,
      tasks: S.arr(S.str)
    }),
    { minItems: 1, maxItems: MAX_PHASES }
  )
});

export const minPhases = (days) => Math.min(3, days);

/** Structural check (fed back to the LLM for retries). Content issues are repaired, not retried. */
export function makeValidator(days) {
  return (d) => {
    if (!d || typeof d.summary !== 'string') return '"summary" must be a string.';
    if (!Array.isArray(d.phases)) return '"phases" must be an array.';
    if (d.phases.length < minPhases(days) || d.phases.length > MAX_PHASES) return `Return between ${minPhases(days)} and ${MAX_PHASES} phases.`;
    for (const [i, p] of d.phases.entries()) {
      if (!p || typeof p.phaseTitle !== 'string') return `phases[${i}].phaseTitle must be a string.`;
      if (!Array.isArray(p.tasks) || !p.tasks.some((t) => typeof t === 'string' && t.trim())) return `phases[${i}].tasks must contain at least one string.`;
    }
    return null;
  };
}

// ---------------------------------------------------------------- text repair

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const PATH_DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+(?:com|org|net|fr|de|eu|uk|io|info)\/[^\s<>"')\]]*/gi;
const MULTI_REF_RE = /\[\s*R\s*\d+(?:\s*(?:,|;|and|&|\/)\s*R?\s*\d+)+\s*\]/gi;
const REF_RE = /\[\s*R\s*(\d+)\s*\]/gi;

/** True if the text still contains something URL-like. */
export const hasUrl = (t) => new RegExp(URL_RE.source, 'i').test(t) || new RegExp(PATH_DOMAIN_RE.source, 'i').test(t);

/**
 * Strip URLs and resolve [R#] references in one piece of text.
 * @param {string} text
 * @param {Array<{title: string}>} resources  index 0 = [R1]
 * @param {object} stats  mutated counters
 */
export function cleanText(text, resources, stats) {
  let t = String(text ?? '');
  t = t.replace(URL_RE, () => { stats.urlsStripped++; return ''; });
  t = t.replace(PATH_DOMAIN_RE, () => { stats.urlsStripped++; return ''; });
  t = t.replace(MULTI_REF_RE, (m) => m.replace(/^\[|\]$/g, '').split(/\s*(?:,|;|and|&|\/)\s*/i).map((x) => `[R${x.replace(/\D/g, '')}]`).join(', '));
  t = t.replace(REF_RE, (_, n) => {
    const r = resources[Number(n) - 1];
    if (!r) { stats.unknownRefs++; return ''; }
    stats.refsResolved++;
    return `“${r.title}”`;
  });
  return t
    .replace(/\(\s*[,;:]*\s*\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '')
    .trim()
    .slice(0, MAX_TASK_LEN);
}

// ---------------------------------------------------------------- day ranges

/**
 * Deterministically rebuild contiguous day ranges covering 1..days.
 * Keeps the model's ranges when already valid; otherwise scales the model's span lengths
 * (largest-remainder method, every phase gets >= 1 day). Phases beyond `days` are not allowed
 * (caller guarantees phases.length <= days).
 * @returns {{ranges: Array<[number, number]>, repaired: boolean}}
 */
export function repairRanges(phases, days) {
  const n = phases.length;
  let cursor = 1;
  let valid = true;
  for (const p of phases) {
    if (!Number.isInteger(p.startDay) || !Number.isInteger(p.endDay) || p.startDay !== cursor || p.endDay < p.startDay) { valid = false; break; }
    cursor = p.endDay + 1;
  }
  if (valid && cursor === days + 1) return { ranges: phases.map((p) => [p.startDay, p.endDay]), repaired: false };

  const raw = phases.map((p) => {
    const len = Number.isInteger(p.startDay) && Number.isInteger(p.endDay) ? p.endDay - p.startDay + 1 : NaN;
    return Number.isFinite(len) && len > 0 ? len : null;
  });
  const known = raw.filter((x) => x != null);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weights = raw.map((x) => x ?? avg);
  const total = weights.reduce((a, b) => a + b, 0);
  // Reserve 1 day per phase, distribute the rest proportionally (largest remainder).
  const spare = days - n;
  const exact = weights.map((w) => (w / total) * spare);
  const lens = exact.map((x) => 1 + Math.floor(x));
  let left = days - lens.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % n, left--) lens[order[k][1]]++;
  const ranges = [];
  let start = 1;
  for (const len of lens) { ranges.push([start, start + len - 1]); start += len; }
  return { ranges, repaired: true };
}

const rangeLabel = ([a, b]) => (a === b ? `Day ${a}` : `Days ${a}–${b}`);
const stripRangePrefix = (title) => String(title || '').replace(/^\s*(?:phase\s*\d+\s*[:–-]\s*)?days?\s*\d+(?:\s*[–-]\s*\d+)?\s*[:–-]\s*/i, '').trim();

// ---------------------------------------------------------------- full repair

/**
 * Validate + repair a raw planner output. Pure and deterministic; exported for tests.
 * @param {object} data  raw LLM output
 * @param {{days: number, resources: Array<{title: string}>}} ctx
 * @returns {{summary: string, phases: Array<{phaseTitle: string, focus: string, tasks: string[], startDay: number, endDay: number}>, repairs: object}}
 */
export function repairPlan(data, { days, resources }) {
  const stats = { urlsStripped: 0, unknownRefs: 0, refsResolved: 0, rangesRepaired: false, phasesMerged: 0, phasesSplit: 0, tasksDropped: 0 };
  let phases = (Array.isArray(data?.phases) ? data.phases : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      phaseTitle: typeof p.phaseTitle === 'string' ? p.phaseTitle : '',
      focus: typeof p.focus === 'string' ? p.focus : '',
      startDay: Number.isInteger(p.startDay) ? p.startDay : null,
      endDay: Number.isInteger(p.endDay) ? p.endDay : null,
      tasks: (Array.isArray(p.tasks) ? p.tasks : []).filter((t) => typeof t === 'string')
    }));
  if (!phases.length) throw new Error('planner returned no phases');

  // Phase count: merge extras into the last allowed phase.
  const maxP = Math.min(MAX_PHASES, days);
  while (phases.length > maxP) {
    const extra = phases.pop();
    const last = phases[phases.length - 1];
    last.tasks.push(...extra.tasks);
    last.endDay = extra.endDay ?? last.endDay;
    stats.phasesMerged++;
  }
  // Too few: split the longest phase (by task count) in two.
  while (phases.length < minPhases(days)) {
    let idx = 0;
    phases.forEach((p, i) => { if (p.tasks.length > phases[idx].tasks.length) idx = i; });
    const p = phases[idx];
    const half = Math.ceil(p.tasks.length / 2);
    const second = { ...p, phaseTitle: `${stripRangePrefix(p.phaseTitle) || 'Study block'} (continued)`, tasks: p.tasks.slice(half), startDay: null, endDay: null };
    p.tasks = p.tasks.slice(0, half);
    p.startDay = p.endDay = null;
    if (!second.tasks.length) second.tasks = ['Review and consolidate the previous phase’s material.'];
    phases.splice(idx + 1, 0, second);
    stats.phasesSplit++;
  }

  // Text clean-up.
  for (const p of phases) {
    const before = p.tasks.length;
    p.tasks = p.tasks.map((t) => cleanText(t, resources, stats)).filter((t) => t.length >= 3).slice(0, MAX_TASKS);
    stats.tasksDropped += before - p.tasks.length;
    if (!p.tasks.length) p.tasks = ['Review and consolidate the previous phase’s material.'];
    p.focus = cleanText(p.focus, resources, stats).slice(0, 300);
    p.phaseTitle = cleanText(stripRangePrefix(p.phaseTitle), resources, stats).slice(0, 120) || 'Study block';
  }

  const { ranges, repaired } = repairRanges(phases, days);
  stats.rangesRepaired = repaired;
  phases = phases.map((p, i) => ({
    phaseTitle: `${rangeLabel(ranges[i])}: ${p.phaseTitle}`,
    focus: p.focus,
    tasks: p.tasks,
    startDay: ranges[i][0],
    endDay: ranges[i][1]
  }));
  const summary = cleanText(data?.summary, resources, stats).slice(0, 800);
  return { summary, phases, repairs: stats };
}

/** Problems left after repair (should always be empty; used by tests and as a safety net). */
export function checkPlan(plan, days) {
  const issues = [];
  let cursor = 1;
  for (const p of plan.phases) {
    if (p.startDay !== cursor) issues.push(`gap/overlap at day ${cursor}`);
    cursor = p.endDay + 1;
    for (const t of p.tasks) {
      if (hasUrl(t)) issues.push(`URL in task: ${t}`);
      if (/\[\s*R\s*\d+\s*\]/i.test(t)) issues.push(`unresolved ref in task: ${t}`);
    }
  }
  if (cursor !== days + 1) issues.push(`ranges end at ${cursor - 1}, expected ${days}`);
  if (plan.phases.length > MAX_PHASES || plan.phases.length < minPhases(days)) issues.push(`phase count ${plan.phases.length}`);
  return issues;
}

// ---------------------------------------------------------------- weakness weighting

/** Skills sorted weakest-first from diagnostic scores (0..1). */
export function weakestSkills(skillScores) {
  if (!skillScores || typeof skillScores !== 'object') return [];
  return Object.entries(skillScores)
    .filter(([k, v]) => STUDY_SKILLS.includes(k) && typeof v === 'number' && v >= 0 && v <= 1)
    .sort((a, b) => a[1] - b[1]);
}

// ---------------------------------------------------------------- fallback

/**
 * Deterministic plan from verified resources only — the schedule of lib/algo/schedule.js
 * (fixed days, apportionment, interleaving, spaced reviews), in the roadmap phase shape.
 * Kept as a thin wrapper so older callers and tests keep working.
 */
export function buildFallbackPlan({ exam, level, days, resources, skillScores, examProfile = null }) {
  const s = buildSchedule({ exam, level, days, skillScores, examProfile, resources });
  return {
    summary: s.summary,
    phases: s.phases.map(({ phaseTitle, focus, tasks, startDay, endDay }) => ({ phaseTitle, focus, tasks, startDay, endDay })),
    repairs: { urlsStripped: 0, unknownRefs: 0, refsResolved: 0, rangesRepaired: false, phasesMerged: 0, phasesSplit: 0, tasksDropped: 0 }
  };
}

// ---------------------------------------------------------------- polish (wording only)

const POLISH_SCHEMA = S.obj({
  summary: S.str,
  phases: S.arr(S.obj({ phaseTitle: S.str, focus: S.str, tasks: S.arr(S.str) }), { minItems: 1, maxItems: MAX_PHASES })
});
const QUOTED_RE = /“[^”]+”/g;
const DAY_PREFIX_RE = /^\s*(Days?\s+\d+(?:\s*[–-]\s*\d+)?)\s*[—–-]/i;
const dayPrefix = (t) => (DAY_PREFIX_RE.exec(String(t)) || [])[1]?.replace(/\s+/g, ' ').replace('-', '–') || null;

/** Validator for polishPlan output against the deterministic skeleton (exported for tests). */
export function makePolishValidator(skeleton) {
  return (d) => {
    if (!d || typeof d.summary !== 'string' || !d.summary.trim()) return '"summary" must be a non-empty string.';
    if (hasUrl(d.summary)) return 'summary must not contain URLs.';
    if (!Array.isArray(d.phases) || d.phases.length !== skeleton.phases.length) return `Return exactly ${skeleton.phases.length} phases, in the same order.`;
    for (const [i, p] of d.phases.entries()) {
      const sk = skeleton.phases[i];
      if (!p || typeof p.phaseTitle !== 'string' || !p.phaseTitle.trim()) return `phases[${i}].phaseTitle must be a non-empty string.`;
      if (typeof p.focus !== 'string') return `phases[${i}].focus must be a string.`;
      if (hasUrl(p.phaseTitle) || hasUrl(p.focus)) return `phases[${i}] title/focus must not contain URLs.`;
      if (!Array.isArray(p.tasks) || p.tasks.length !== sk.tasks.length) return `phases[${i}].tasks must have exactly ${sk.tasks.length} items (one per input task, same order).`;
      for (const [j, t] of p.tasks.entries()) {
        if (typeof t !== 'string' || !t.trim()) return `phases[${i}].tasks[${j}] must be a non-empty string.`;
        if (hasUrl(t)) return `phases[${i}].tasks[${j}] must not contain a URL.`;
        const src = sk.tasks[j];
        for (const q of String(src).match(QUOTED_RE) || []) if (!t.includes(q)) return `phases[${i}].tasks[${j}] must keep the resource title ${q} exactly.`;
        const pre = dayPrefix(src);
        if (pre && dayPrefix(t) !== pre) return `phases[${i}].tasks[${j}] must start with "${pre} —" like the input task.`;
      }
    }
    return null;
  };
}

/**
 * Rewrite ONLY the wording of a deterministic schedule (lib/algo/schedule.js buildSchedule output):
 * summary, phase titles/focus and task phrasing 1:1. Counts, order, day ranges, resource titles and
 * the "Days a–b —" prefixes are enforced by makePolishValidator(); repairPlan() then keeps the
 * skeleton's (already valid) ranges. Never throws.
 * @returns {Promise<{ok: boolean, plan?: object, wording?: {summary: string, phases: Record<string, {title: string, focus: string}>}, usage?: object, error?: string}>}
 */
export async function polishPlan({ exam, level, days, skeleton, resources = [], examProfile = null }) {
  if (!skeleton?.phases?.length) return { ok: false, error: 'polishPlan needs a skeleton' };
  const sk = {
    summary: skeleton.summary,
    phases: skeleton.phases.map((p) => ({ phaseTitle: stripRangePrefix(p.phaseTitle), focus: p.focus, tasks: p.tasks }))
  };
  const sections = (examProfile?.sections || []).slice(0, 12).map((s) => s.name).filter(Boolean);
  const system =
    'You are the Pathfinding planner of OpenExam Hub, acting as an editor. You receive a finished study schedule (the skeleton) built by an algorithm. ' +
    'Rewrite ONLY the wording so it reads naturally and encouragingly. Keep exactly the same number of phases and tasks, in the same order. ' +
    'Each task keeps its meaning, its leading "Day N —" or "Days a–b —" prefix, and every resource title in “curly quotes” exactly as written. ' +
    'Never add URLs, websites, new resources, exam facts, numbers of days or durations that are not in the skeleton. Do not put day numbers in phaseTitle or the summary.';
  const prompt = JSON.stringify({
    exam, level, days,
    officialSections: sections.length ? sections : undefined,
    skeleton: sk,
    output: '{summary, phases:[{phaseTitle, focus, tasks[]}]}'
  });
  let data;
  let usage;
  try {
    ({ data, usage } = await generateJson({ agent: 'PLANNER', system, prompt, schema: POLISH_SCHEMA, validate: makePolishValidator(sk), temperature: 0.3 }));
  } catch (err) {
    return { ok: false, error: `planner LLM failed: ${err?.message || 'unknown error'}` };
  }
  try {
    const raw = {
      summary: data.summary,
      phases: data.phases.map((p, i) => ({ phaseTitle: p.phaseTitle, focus: p.focus, tasks: p.tasks, startDay: skeleton.phases[i].startDay, endDay: skeleton.phases[i].endDay }))
    };
    const plan = repairPlan(raw, { days, resources });
    const issues = checkPlan(plan, days);
    if (issues.length) return { ok: false, error: `polished plan failed validation: ${issues[0]}` };
    const wording = { summary: plan.summary, phases: {} };
    skeleton.phases.forEach((p, i) => {
      if (p.kind && !wording.phases[p.kind]) wording.phases[p.kind] = { title: stripRangePrefix(plan.phases[i].phaseTitle).slice(0, 120), focus: plan.phases[i].focus.slice(0, 300) };
    });
    return { ok: true, plan, wording, usage };
  } catch (err) {
    return { ok: false, error: `polished plan unusable: ${err?.message || 'unknown'}` };
  }
}

// ---------------------------------------------------------------- main

/**
 * Build a roadmap plan with the LLM, then validate/repair it. Never throws.
 * @param {{exam: string, level: string, days: number,
 *          resources: Array<{id: string, url: string, title: string, category?: string, skills?: string[]}>,
 *          examProfile?: {sections?: Array<{name: string, durationMinutes?: number|null, questionCount?: number|null}>}|null,
 *          skillScores?: Record<string, number>|null}} input
 * @returns {Promise<{ok: boolean, plan?: {summary: string, phases: object[], repairs: object}, error?: string, usage?: object}>}
 */
export async function planRoadmap({ exam, level, days, resources, examProfile = null, skillScores = null }) {
  const res = (resources || []).slice(0, MAX_RESOURCES);
  if (!res.length) return { ok: false, error: 'planner needs at least one verified resource' };
  const catalogue = res.map((r, i) => `[R${i + 1}] ${r.title} — ${r.category || 'resource'} — skills: ${(r.skills || []).join(', ') || 'general'}`).join('\n');
  const weak = weakestSkills(skillScores);
  const weakText = weak.length
    ? `Diagnostic skill scores (0 = weak, 1 = strong): ${weak.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}. Give clearly MORE days and tasks to the weakest skills.`
    : 'No diagnostic is available; balance the skills.';
  const sections = (examProfile?.sections || []).slice(0, 12);
  const formatText = sections.length
    ? `Exam sections (from the official page, use only these facts):\n${sections.map((s) => `- ${s.name}${s.durationMinutes ? `, ${s.durationMinutes} min` : ''}${s.questionCount ? `, ${s.questionCount} questions` : ''}`).join('\n')}`
    : 'No verified exam format sheet is available: do NOT state section durations, question counts or scoring rules.';
  const nPh = `${minPhases(days)} to ${Math.min(MAX_PHASES, days)}`;

  const system =
    'You are the Pathfinding planner of OpenExam Hub. You build a realistic day-by-day study roadmap using ONLY the numbered resources provided. ' +
    'Refer to a resource only by its tag, e.g. [R2]. Never write a URL or website address. Never cite a resource that is not in the list. ' +
    'Never state exam facts (timings, number of questions, scores) that are not given to you. Tasks are concrete actions, one sentence each.';
  const prompt =
    `Exam: ${exam}\nTarget level: ${level}\nTotal days: ${days}\n\nResources:\n${catalogue}\n\n${formatText}\n\n${weakText}\n\n` +
    `Return {summary, phases:[{phaseTitle, focus, startDay, endDay, tasks[]}]} with ${nPh} phases. ` +
    `Phases must be consecutive and together cover day 1 to day ${days} exactly (first startDay 1, last endDay ${days}, no gaps). ` +
    `Each phase has 3 to ${MAX_TASKS} tasks. Do not put day numbers in phaseTitle.`;
  let data;
  let usage;
  try {
    ({ data, usage } = await generateJson({ agent: 'PLANNER', system, prompt, schema: SCHEMA, validate: makeValidator(days), temperature: 0.4 }));
  } catch (err) {
    return { ok: false, error: `planner LLM failed: ${err?.message || 'unknown error'}` };
  }
  try {
    const plan = repairPlan(data, { days, resources: res });
    const issues = checkPlan(plan, days);
    if (issues.length) return { ok: false, error: `planner output failed validation: ${issues[0]}` };
    return { ok: true, plan, usage };
  } catch (err) {
    return { ok: false, error: `planner output unusable: ${err?.message || 'unknown'}` };
  }
}
