/**
 * Deterministic study scheduler: (days, diagnostic, exam profile, ranked resources) -> day-by-day plan.
 * The LLM planner only polishes wording on top of this; if it fails, this IS the plan.
 *
 * Steps (all O(days · skills) or better):
 *  1. Fixed days: orientation (day 1), mock exams at a spaced cadence (≈40 %, 70 %, 90 % of the
 *     plan; 20 % added for 60+ days), a taper (exam eve, plus the day before for 21+ days) and
 *     review days on an expanding-interval ladder 3, 5, 8, 13, then every 14 days (spacing effect;
 *     Leitner / Pimsleur graduated-interval recall, capped so long plans keep reviewing).
 *  2. Need per skill = examSectionWeight × (1 + α·(1 − diagnosticScore)), α = 1.5.
 *  3. Study days apportioned by largest remainder (Hamilton method), each skill ≥ 1 day when
 *     possible, and each capped at ⌊(2n+2)/3⌋ so the "≤ 2 consecutive" rule stays feasible.
 *  4. Order by stride scheduling (Waldspurger & Weihl 1995): each skill's j-th session has an ideal
 *     slot (j+½)·n/count; pick the earliest ideal slot that does not make a 3-in-a-row run. This
 *     interleaves skills evenly (interleaved practice, Rohrer & Taylor 2007).
 *  5. Resources per skill are used round-robin in rank order, so the best resource is used most.
 *  6. Days are grouped into 1–5 phases (roadmap shape of CONTRACT.md, ≤ 10 task strings each).
 *
 * @module lib/algo/schedule
 */
import { STUDY_SKILLS, clamp, round, largestRemainder } from './common.js';

export const DEFAULT_SECTION_WEIGHTS = { listening: 0.2, reading: 0.2, writing: 0.2, speaking: 0.2, grammar: 0.1, vocabulary: 0.1 };
export const WEAKNESS_ALPHA = 1.5;
export const REVIEW_LADDER = [3, 5, 8, 13];
export const REVIEW_CAP = 14;
export const MAX_TASKS_PER_PHASE = 10;
export const MAX_RUN = 2;

const SECTION_PATTERNS = [
  ['listening', /listen|écoute|ecoute|compr[ée]hension (de l'|)oral|oral comprehension|h[öo]ren|h[öo]rverst/i],
  ['reading', /read|lecture|compr[ée]hension (des |)[ée]crit|written comprehension|lesen|leseverst/i],
  ['writing', /writ|expression [ée]crite|production [ée]crite|schreiben|schriftlich/i],
  ['speaking', /speak|expression orale|production orale|sprechen|m[üu]ndlich|interaction orale/i],
  ['grammar', /grammar|grammaire|structure|sprachbaustein|use of english|language use/i],
  ['vocabulary', /vocab|lexi(que|cal)|wortschatz/i]
];

/** Map an exam profile's sections to skill weights (duration-weighted), blended 70/30 with defaults. */
export function sectionWeightsFromProfile(profile) {
  const raw = Object.fromEntries(STUDY_SKILLS.map((s) => [s, 0]));
  let total = 0;
  for (const sec of profile?.sections || []) {
    const name = `${sec?.name || ''} ${sec?.description || ''}`;
    const hit = SECTION_PATTERNS.find(([, re]) => re.test(sec?.name || '')) || SECTION_PATTERNS.find(([, re]) => re.test(name));
    if (!hit) continue;
    const w = Number(sec.durationMinutes) > 0 ? Number(sec.durationMinutes) : Number(sec.questionCount) > 0 ? Number(sec.questionCount) : 30;
    raw[hit[0]] += w;
    total += w;
  }
  if (!total) return { ...DEFAULT_SECTION_WEIGHTS };
  const out = {};
  for (const s of STUDY_SKILLS) out[s] = round(0.7 * (raw[s] / total) + 0.3 * DEFAULT_SECTION_WEIGHTS[s], 4);
  return out;
}

/** Need per skill: section weight scaled up for weaker diagnostic scores. */
export function skillNeeds(sectionWeights = DEFAULT_SECTION_WEIGHTS, skillScores = null) {
  const out = {};
  for (const s of STUDY_SKILLS) {
    const w = Math.max(0, Number(sectionWeights?.[s] ?? DEFAULT_SECTION_WEIGHTS[s]) || 0);
    const sc = typeof skillScores?.[s] === 'number' ? clamp(skillScores[s], 0, 1) : 0.5;
    out[s] = w * (1 + WEAKNESS_ALPHA * (1 - sc));
  }
  return out;
}

function mockFractions(days) {
  if (days < 4) return [];
  if (days < 7) return [0.75];
  if (days < 14) return [0.5, 0.9];
  if (days < 60) return [0.4, 0.7, 0.9];
  return [0.2, 0.4, 0.7, 0.9];
}

/** Assign fixed-purpose days. Returns {type: Map<day, type>, taperStart}. */
export function fixedDays(days) {
  const type = new Map();
  if (days === 1) { type.set(1, 'taper'); return { type, taperStart: 1 }; }
  const taperLen = days >= 21 ? 2 : 1;
  const taperStart = days - taperLen + 1;
  for (let d = taperStart; d <= days; d++) type.set(d, 'taper');
  if (days >= 3) type.set(1, 'orientation');
  const lastFree = taperStart - 1;
  const place = (target, t) => {
    // nearest free day to target within [2, lastFree], preferring later on ties
    for (let off = 0; off <= days; off++) {
      for (const d of [target + off, target - off]) {
        if (d >= 2 && d <= lastFree && !type.has(d)) { type.set(d, t); return d; }
      }
    }
    return null;
  };
  for (const f of mockFractions(days)) place(clamp(Math.round(f * days), 2, lastFree), 'mock');
  if (days >= 7) {
    let cur = 1;
    for (let i = 0; ; i++) {
      cur += i < REVIEW_LADDER.length ? REVIEW_LADDER[i] : REVIEW_CAP;
      if (cur >= lastFree) break;
      if (!type.has(cur)) type.set(cur, 'review');
      else if (!type.has(cur + 1) && cur + 1 < lastFree) type.set(cur + 1, 'review');
    }
  }
  return { type, taperStart };
}

/** Apportion `n` study days over skills by need (largest remainder, min 1 each if possible, run-feasibility cap). */
export function allocateStudyDays(needs, n) {
  const skills = STUDY_SKILLS.filter((s) => needs[s] > 0);
  if (!n || !skills.length) return Object.fromEntries(STUDY_SKILLS.map((s) => [s, 0]));
  const w = skills.map((s) => needs[s]);
  const min = n >= skills.length ? skills.map(() => 1) : null;
  const cap = Math.floor((2 * n + 2) / 3);
  const alloc = largestRemainder(w, n, { min, max: skills.length > 1 ? skills.map(() => cap) : null });
  const out = Object.fromEntries(STUDY_SKILLS.map((s) => [s, 0]));
  skills.forEach((s, i) => { out[s] = alloc[i]; });
  return out;
}

/** Stride-scheduled order of skills over n study slots with no run longer than MAX_RUN. */
export function interleave(alloc, n) {
  const skills = STUDY_SKILLS.filter((s) => alloc[s] > 0);
  const used = Object.fromEntries(skills.map((s) => [s, 0]));
  const seq = [];
  const next = (s) => (used[s] + 0.5) * (n / alloc[s]);
  for (let slot = 0; slot < n; slot++) {
    const open = skills.filter((s) => used[s] < alloc[s]);
    if (!open.length) break;
    const blocked = seq.length >= MAX_RUN && seq.slice(-MAX_RUN).every((x) => x === seq[seq.length - 1]) ? seq[seq.length - 1] : null;
    // Urgency first: if any skill has as many sessions left as slots left allow only it (feasibility), else earliest ideal slot.
    const slotsLeft = n - slot;
    const ordered = open.slice().sort((a, b) => next(a) - next(b) || (alloc[b] - used[b]) - (alloc[a] - used[a]) || STUDY_SKILLS.indexOf(a) - STUDY_SKILLS.indexOf(b));
    const maxLeftSkill = ordered.reduce((m, s) => (alloc[s] - used[s] > alloc[m] - used[m] ? s : m), ordered[0]);
    const maxLeft = alloc[maxLeftSkill] - used[maxLeftSkill];
    let pick;
    if (maxLeftSkill !== blocked && 3 * maxLeft > 2 * slotsLeft) pick = maxLeftSkill;
    else pick = ordered.find((s) => s !== blocked) ?? null;
    if (!pick) { seq.push('mixed'); continue; }
    used[pick]++;
    seq.push(pick);
  }
  return seq;
}

const SKILL_LABEL = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking', grammar: 'Grammar', vocabulary: 'Vocabulary', mixed: 'Mixed skills' };
const PRACTICE_VERB = {
  listening: 'listen and answer the questions with', reading: 'read and answer the questions with', writing: 'write one timed answer using the model tasks in',
  speaking: 'record yourself answering the prompts in', grammar: 'do the grammar exercises in', vocabulary: 'learn and add 15 new words to your flashcards from', mixed: 'do mixed practice with'
};

function resourcePools(resources) {
  const by = Object.fromEntries([...STUDY_SKILLS, 'mock_exam', 'exam_format'].map((s) => [s, []]));
  for (const r of resources || []) for (const s of r.skills || []) if (by[s] && !by[s].includes(r)) by[s].push(r);
  return by;
}

/**
 * Build the full schedule.
 * @param {{exam: string, level: string, days: number, skillScores?: object|null, sectionWeights?: object|null,
 *          examProfile?: object|null, resources?: object[], dailyMinutes?: number}} input
 * @returns {{calendar: object[], phases: object[], allocation: object, needs: object, summary: string, method: string}}
 */
export function buildSchedule(input) {
  const days = Math.round(Number(input.days));
  if (!Number.isInteger(days) || days < 1 || days > 180) throw new Error('buildSchedule: days must be 1..180');
  const exam = String(input.exam || '').toUpperCase();
  const level = String(input.level || '').toUpperCase();
  const minutes = clamp(Math.round(Number(input.dailyMinutes) || 60), 15, 240);
  const sw = input.sectionWeights || sectionWeightsFromProfile(input.examProfile);
  const needs = skillNeeds(sw, input.skillScores);
  const { type, taperStart } = fixedDays(days);
  const studyDays = [];
  for (let d = 1; d <= days; d++) if (!type.has(d)) studyDays.push(d);
  const allocation = allocateStudyDays(needs, studyDays.length);
  const seq = interleave(allocation, studyDays.length);
  const pools = resourcePools(input.resources);
  const cursor = {};
  const take = (pool, key) => {
    if (!pool.length) return null;
    const i = cursor[key] || 0;
    cursor[key] = i + 1;
    return { r: pool[i % pool.length], session: Math.floor(i / pool.length) + 1 };
  };
  const weak = Object.entries(input.skillScores || {}).filter(([s, v]) => STUDY_SKILLS.includes(s) && typeof v === 'number' && v < 0.5).sort((a, b) => a[1] - b[1]).map(([s]) => s);
  const srs = (m) => ({ text: `Review today's due flashcards (about ${m} min).`, minutes: m, skill: 'vocabulary', resourceId: null, kind: 'srs' });
  const q = (r) => `“${r.title}”`;

  const calendar = [];
  let si = 0;
  let mockNo = 0;
  let lastReview = 1;
  for (let d = 1; d <= days; d++) {
    const t = type.get(d) || 'study';
    const tasks = [];
    let skill = null;
    if (t === 'orientation') {
      const f = take(pools.exam_format, 'fmt');
      tasks.push(f ? { text: `Read the official exam information in ${q(f.r)} and note each section and its timing.`, minutes: Math.round(minutes * 0.5), skill: 'exam_format', resourceId: f.r.id, kind: 'format' }
        : { text: 'Find the official exam page among your resources and note each section of the exam.', minutes: Math.round(minutes * 0.5), skill: 'exam_format', resourceId: null, kind: 'format' });
      tasks.push({ text: 'Take the 2-minute placement self-check, or try one short exercise per skill, to find your weaker areas.', minutes: Math.round(minutes * 0.5), skill: null, resourceId: null, kind: 'baseline' });
    } else if (t === 'mock') {
      mockNo++;
      const m = take(pools.mock_exam, 'mock') || take(pools.exam_format, 'fmt');
      tasks.push(m ? { text: `Mock exam ${mockNo}: do a full timed practice test with ${q(m.r)} under exam conditions.`, minutes: Math.round(minutes * 1.5), skill: 'mock_exam', resourceId: m.r.id, kind: 'mock' }
        : { text: `Mock exam ${mockNo}: a full timed practice session with your verified resources, under exam conditions.`, minutes: Math.round(minutes * 1.5), skill: 'mock_exam', resourceId: null, kind: 'mock' });
      tasks.push({ text: 'Mark it, then list your three most frequent mistakes.', minutes: 20, skill: null, resourceId: null, kind: 'reflect' });
    } else if (t === 'review') {
      tasks.push({ text: `Review day: redo the mistakes and notes from days ${lastReview + 1}–${d - 1}${weak.length ? `, especially ${SKILL_LABEL[weak[0]].toLowerCase()}` : ''}.`, minutes: Math.round(minutes * 0.6), skill: null, resourceId: null, kind: 'review' });
      tasks.push(srs(Math.round(minutes * 0.4)));
      lastReview = d;
    } else if (t === 'taper') {
      if (d === days) tasks.push({ text: days === 1 ? 'Read the exam format, do one short practice per section, check your exam logistics and rest.' : 'Exam eve: light review only, check your ID, venue and start time, then rest.', minutes: 30, skill: null, resourceId: null, kind: 'taper' });
      else tasks.push({ text: 'Light review of your mistake notebook and flashcards; no new material.', minutes: Math.round(minutes * 0.5), skill: null, resourceId: null, kind: 'taper' });
    } else {
      skill = seq[si++] || 'mixed';
      const main = Math.round(minutes * (d > 1 ? 0.8 : 1));
      const own = skill === 'mixed' ? take(input.resources || [], 'any') : take(pools[skill] || [], skill);
      const viaMock = own ? null : take(pools.mock_exam, `mock-${skill}`);
      if (own) tasks.push({ text: `${SKILL_LABEL[skill]}: ${PRACTICE_VERB[skill]} ${q(own.r)}${own.session > 1 ? ` (session ${own.session})` : ''}.`, minutes: main, skill, resourceId: own.r.id, kind: 'study' });
      else if (viaMock) tasks.push({ text: `${SKILL_LABEL[skill]}: practise the ${skill} part of ${q(viaMock.r)}, untimed, and check every answer.`, minutes: main, skill, resourceId: viaMock.r.id, kind: 'study' });
      else tasks.push({ text: `${SKILL_LABEL[skill]}: ${main} minutes of ${skill} practice (no verified ${skill} resource in the library yet).`, minutes: main, skill, resourceId: null, kind: 'study' });
      if (d > 1) tasks.push(srs(minutes - main));
    }
    calendar.push({ day: d, type: t, skill, minutes: tasks.reduce((a, x) => a + x.minutes, 0), tasks });
  }

  // Report what was actually scheduled ('mixed' appears only when one skill has all the weight).
  for (const k of Object.keys(allocation)) allocation[k] = 0;
  for (const x of seq) allocation[x] = (allocation[x] || 0) + 1;
  const phases = groupPhases(calendar, days, taperStart, weak);
  const top = STUDY_SKILLS.slice().sort((a, b) => allocation[b] - allocation[a] || STUDY_SKILLS.indexOf(a) - STUDY_SKILLS.indexOf(b)).filter((s) => allocation[s] > 0).slice(0, 2);
  const summary = `A ${days}-day ${exam} ${level} plan: ${studyDays.length} study day(s)${mockNo ? `, ${mockNo} mock exam(s)` : ''}${[...type.values()].filter((x) => x === 'review').length ? `, ${[...type.values()].filter((x) => x === 'review').length} review day(s)` : ''}; most time goes to ${top.map((s) => s).join(' and ') || 'mixed practice'}.`;
  return { summary, phases, calendar, allocation, needs: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, round(v, 4)])), method: 'deterministic_v1' };
}

const KIND_TITLES = {
  orientation: ['Orientation & baseline', 'Learn the exam format and find your starting point.'],
  foundation: ['Foundations', 'Short daily sessions that rotate through every skill.'],
  build: ['Skill building', 'Targeted practice, with more time on your weaker skills.'],
  exam_practice: ['Exam practice', 'Timed practice and mock exams under exam conditions.'],
  taper: ['Final review', 'Light review and rest so you arrive fresh.']
};

function phaseKinds(days) {
  if (days === 1) return [['taper', 1]];
  if (days === 2) return [['build', 1], ['taper', 2]];
  if (days < 7) return [['orientation', 1], ['build', days - 1], ['taper', days]];
  if (days < 21) return [['orientation', 1], ['build', Math.round(0.6 * days)], ['exam_practice', days - 1], ['taper', days]];
  return [['orientation', clamp(Math.round(0.07 * days), 1, 7)], ['foundation', Math.round(0.35 * days)], ['build', Math.round(0.65 * days)], ['exam_practice', days - 2], ['taper', days]];
}

const rangeLabel = (a, b) => (a === b ? `Day ${a}` : `Days ${a}–${b}`);

function groupPhases(calendar, days, taperStart, weak) {
  const kinds = phaseKinds(days);
  const phases = [];
  let start = 1;
  for (const [kind, endRaw] of kinds) {
    const end = Math.max(start, Math.min(days, endRaw));
    if (start > days) break;
    const slice = calendar.slice(start - 1, end);
    const [title, focus] = KIND_TITLES[kind];
    const g = Math.ceil(slice.length / MAX_TASKS_PER_PHASE);
    const tasks = [];
    for (let i = 0; i < slice.length; i += g) {
      const block = slice.slice(i, i + g);
      if (block.length === 1) { tasks.push(`${rangeLabel(block[0].day, block[0].day)} — ${block[0].tasks.filter((t) => t.kind !== 'srs').map((t) => t.text).join(' ')}`); continue; }
      const parts = [];
      const studyCount = {};
      for (const c of block) {
        if (c.type === 'study') studyCount[c.skill] = (studyCount[c.skill] || 0) + 1;
        else if (c.type === 'mock') parts.push(`mock exam on day ${c.day}`);
        else if (c.type === 'review') parts.push(`review on day ${c.day}`);
        else if (c.type === 'taper') parts.push(`light review on day ${c.day}`);
        else if (c.type === 'orientation') parts.push('exam format and baseline on day 1');
      }
      const study = Object.entries(studyCount).sort((a, b) => b[1] - a[1] || STUDY_SKILLS.indexOf(a[0]) - STUDY_SKILLS.indexOf(b[0])).map(([s, n]) => `${SKILL_LABEL[s] || s} ×${n}`);
      tasks.push(`${rangeLabel(block[0].day, block[block.length - 1].day)} — ${[study.length ? study.join(', ') : null, ...parts].filter(Boolean).join('; ')}; daily flashcard review.`);
    }
    phases.push({
      kind,
      phaseTitle: `${rangeLabel(start, end)}: ${title}`,
      focus: kind === 'build' && weak.length ? `Targeted practice, with extra time on ${weak.slice(0, 2).join(' and ')}.` : focus,
      tasks,
      startDay: start,
      endDay: end
    });
    start = end + 1;
  }
  return phases;
}

/** Day index (1-based) of `now` in a plan that started on `startDate` (YYYY-MM-DD, UTC). */
export function dayOfPlan(startDate, now = Date.now()) {
  const s = Date.parse(`${String(startDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s)) return 1;
  return Math.floor((now - s) / 864e5) + 1;
}

const TYPE_CODE = { study: 's', mock: 'm', review: 'r', taper: 't', orientation: 'o' };
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([k, v]) => [v, k]));
const SKILL_CODES = [...STUDY_SKILLS, 'mixed'];

/**
 * Compact storage form of a calendar: one short string per day, "type.skill.resource.minutes",
 * e.g. "s.3.1.60" (study, speaking, verifiedResources[1], 60 min) — ~10 B/day instead of ~350 B,
 * so a 180-day plan is ~2 KB in the user's roadmap doc. Firestore has no nested arrays, hence strings.
 * Task texts are regenerated deterministically (same inputs + method version -> same text).
 */
export function compactCalendar(calendar, resources = []) {
  const idx = new Map((resources || []).map((r, i) => [r.id, i]));
  return calendar.map((c) => {
    const main = c.tasks.find((t) => t.kind !== 'srs' && t.resourceId) || null;
    const ri = main ? idx.get(main.resourceId) ?? -1 : -1;
    const si = c.skill ? SKILL_CODES.indexOf(c.skill) : -1;
    return `${TYPE_CODE[c.type]}.${si}.${ri}.${c.minutes}`;
  });
}

/** Inverse of compactCalendar (structure only: day, type, skill, resourceId, minutes). */
export function expandCalendar(codes, resources = []) {
  return (codes || []).map((code, i) => {
    const [t, si, ri, m] = String(code).split('.');
    const s = Number(si); const r = Number(ri);
    return { day: i + 1, type: CODE_TYPE[t] || 'study', skill: s >= 0 ? SKILL_CODES[s] : null, resourceId: r >= 0 ? resources[r]?.id ?? null : null, minutes: Number(m) || 0 };
  });
}
