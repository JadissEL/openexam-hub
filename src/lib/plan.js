/**
 * Client-side plan maths. Thin wrappers over the SAME pure modules the server uses
 * (lib/algo/schedule.js, progress.js, srs.js), so the day list, task keys and pace numbers
 * in the browser match the server's coach exactly. No I/O here.
 */
import { expandCalendar, calendarTasks } from '../../lib/algo/schedule.js';
import { assessProgress } from '../../lib/algo/progress.js';
import { STUDY_SKILLS } from '../../lib/algo/common.js';

const DAY_MS = 864e5;
// Mirror of lib/algo/keys.js quantiseProfile (keys.js uses node:crypto, so it is not bundled).
// scripts/test-algo.mjs checks both stay identical.
const BANDS = [{ code: 'w', below: 0.4 }, { code: 'm', below: 0.7 }, { code: 's', below: Infinity }];
export function quantiseProfile(skillScores) {
  if (!skillScores || typeof skillScores !== 'object') return null;
  let any = false;
  const code = STUDY_SKILLS.map((s) => {
    const v = skillScores[s];
    if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
    any = true;
    const x = Math.max(0, Math.min(1, v));
    return BANDS.find((b) => x < b.below).code;
  }).join('');
  return any ? code : null;
}

/** Local calendar date as YYYY-MM-DD (the learner's day, not UTC). */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The learner's local "now" expressed on the UTC day grid the algorithms use (noon of that date). */
export function planNow(d = new Date()) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

export const hasSchedule = (rm) => Array.isArray(rm?.calendar) && rm.calendar.length > 0 && rm.calendar.length === Number(rm.days);

/** Day-by-day checkable tasks: [{day, type, skill, minutes, tasks:[{key, text, minutes, resourceId, kind, skill}]}]. */
export function planDays(rm) {
  if (!hasSchedule(rm)) return [];
  const res = rm.verifiedResources || [];
  return calendarTasks(expandCalendar(rm.calendar, res), res);
}

/** 1-based plan day for today (can be < 1 before the start, > days after the end). */
export function currentDay(rm, d = new Date()) {
  const s = Date.parse(`${String(rm?.createdAt || '').slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(s)) return 1;
  return Math.floor((planNow(d) - s) / DAY_MS) + 1;
}

/**
 * Pace / on-track / readiness for a scheduled plan (lib/algo/progress.js assessProgress).
 * @param {object} rm      roadmap with calendar + progress.done
 * @param {object[]} days  planDays(rm)
 * @param {{abilityScores?: object, retentionBySkill?: object}} [extra]
 */
export function planProgress(rm, days, extra = {}, d = new Date()) {
  const done = rm?.progress?.done || {};
  const start = Date.parse(`${String(rm?.createdAt || '').slice(0, 10)}T00:00:00Z`);
  const all = days.flatMap((x) => x.tasks);
  const bySkill = {};
  const completedAt = [];
  for (const t of all) {
    const s = t.skill && STUDY_SKILLS.includes(t.skill) ? t.skill : null;
    if (s) { bySkill[s] ||= { planned: 0, done: 0 }; bySkill[s].planned++; }
    if (t.key in done) {
      completedAt.push(done[t.key] > 0 ? done[t.key] * 1000 : start);
      if (s) bySkill[s].done++;
    }
  }
  if (!Number.isFinite(start) || !all.length) return null;
  const a = assessProgress({
    days: Number(rm.days), startDate: start, now: planNow(d), totalTasks: all.length, completedAt, calendar: days, bySkill,
    abilityScores: extra.abilityScores || {}, retentionBySkill: extra.retentionBySkill || {},
    previous: typeof rm?.progress?.onTrack === 'boolean' ? { onTrack: rm.progress.onTrack } : null
  });
  return { ...a, bySkill, pct: all.length ? Math.round((a.done / all.length) * 100) : 0 };
}

/** Tasks before today that are still open (oldest first). */
export function overdueTasks(rm, days, today) {
  const done = rm?.progress?.done || {};
  return days.filter((x) => x.day < today).flatMap((x) => x.tasks.filter((t) => !(t.key in done)).map((t) => ({ ...t, day: x.day })));
}

export const SKILL_TONE = {
  listening: '#FF6B1A', reading: '#F4708A', writing: '#C2410C', speaking: '#EFA0CF', grammar: '#111111', vocabulary: '#9A3412', mixed: '#737373'
};
export const TYPE_LABEL = { study: 'Study', mock: 'Mock exam', review: 'Review', taper: 'Light review', orientation: 'Start' };
