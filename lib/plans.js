/**
 * Shared plan cache helpers (plans/{planKey}, ARCHITECTURE.md §B.2/§B.3). Light module (no agents),
 * used by the orchestrator (POST /api/generate-roadmap) and GET /api/plan.
 * @module lib/plans
 */
import { buildSchedule, compactCalendar } from './algo/schedule.js';

export const PIPELINE_VERSION = 3;
export const CACHE_MAX_AGE_DAYS = 30;
export const MIN_RESOURCES = 3;
const rangeLabel = (a, b) => (a === b ? `Day ${a}` : `Days ${a}–${b}`);
export const iso = (t) => (t?.toDate ? t.toDate().toISOString() : typeof t === 'string' ? t : t instanceof Date ? t.toISOString() : null);
export const llmConfigured = () => Boolean(process.env.LLM_BASE_URL || process.env.LLM_FALLBACK_BASE_URL);

/** Roadmap resource shape (CONTRACT.md) from a ranked/shelf entry. */
export const toVerified = (r) => ({
  id: r.id,
  title: r.title,
  url: r.url,
  license: r.license,
  category: r.category || 'Study resource',
  skills: r.skills || [],
  linkStatus: r.linkStatus,
  lastCheckedAt: iso(r.lastCheckedAt)
});

/**
 * A plans/{key} doc is usable when it is v3, fresh and has enough resources. A deterministic-only
 * plan (no LLM wording) is treated as a miss by the generator once an LLM is configured, so it gets
 * polished; GET /api/plan serves it either way (`requirePolish: false`).
 */
export function usablePlan(c, { requirePolish = true } = {}) {
  if (!c || c.pipelineVersion !== PIPELINE_VERSION || !Array.isArray(c.resources) || c.resources.length < MIN_RESOURCES) return false;
  const ms = c.cachedAt?.toMillis?.() ?? (c.cachedAt instanceof Date ? c.cachedAt.getTime() : Date.parse(c.cachedAt));
  if (!Number.isFinite(ms) || Date.now() - ms > CACHE_MAX_AGE_DAYS * 864e5) return false;
  if (requirePolish && !c.wording && llmConfigured()) return false;
  return true;
}

/**
 * Assemble from a cached plan doc: the schedule is recomputed for the EXACT days (< 1 ms), then the
 * cached LLM wording (titles, focus, summary) is overlaid by phase kind.
 */
export function assembleFromPlan(planDoc, { exam, level, days, skillScores = null }) {
  const resources = planDoc.resources || [];
  const sched = buildSchedule({ exam, level, days, skillScores, sectionWeights: planDoc.sectionWeights || null, resources });
  const w = planDoc.wording || null;
  const phases = sched.phases.map((p) => {
    const ov = w?.phases?.[p.kind];
    return {
      phaseTitle: ov?.title ? `${rangeLabel(p.startDay, p.endDay)}: ${ov.title}` : p.phaseTitle,
      focus: ov?.focus || p.focus,
      tasks: p.tasks,
      startDay: p.startDay,
      endDay: p.endDay
    };
  });
  return { sched, phases, summary: w?.summary || sched.summary, resources };
}

/** CONTRACT.md roadmap from schedule parts. */
export function roadmapFrom({ id, exam, level, days, planKey, sched, phases, summary, resources, examProfile = null, pipeline = [], source }) {
  return {
    id,
    exam,
    level,
    days,
    createdAt: new Date().toISOString().slice(0, 10),
    summary,
    completedTasks: {},
    planKey,
    scheduleMethod: sched.method,
    calendar: compactCalendar(sched.calendar, resources),
    allocation: sched.allocation,
    progress: { done: {} },
    verifiedResources: resources.map(toVerified),
    phases,
    ...(examProfile ? { examProfile } : {}),
    pipeline,
    source
  };
}
