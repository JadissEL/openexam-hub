/**
 * Personal roadmap shape for Firestore. The study app (src/App.jsx) and the Android app
 * both save through this so a plan stays inside firestore.rules (validated keys, bounds).
 */

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const ROADMAP_ALLOWED_KEYS = [
  'id', 'exam', 'level', 'days', 'createdAt', 'summary', 'completedTasks',
  'verifiedResources', 'phases', 'examProfile', 'pipeline', 'source',
  'planKey', 'scheduleMethod', 'calendar', 'allocation', 'progress',
  'targetScore'
];

export function sanitizeRoadmapForStore(raw, docId) {
  if (!raw || typeof raw !== 'object' || !docId) return null;
  const days = Math.round(Number(raw.days));
  const exam = String(raw.exam || '').slice(0, 24);
  if (!CEFR_LEVELS.includes(raw.level) || !Number.isInteger(days) || days < 1 || days > 180) return null;
  if (exam.length < 2 || !Array.isArray(raw.phases)) return null;
  const out = {};
  ROADMAP_ALLOWED_KEYS.forEach((k) => {
    if (raw[k] !== undefined && raw[k] !== null) out[k] = raw[k];
  });
  out.id = docId;
  out.exam = exam;
  out.days = days;
  out.phases = raw.phases.slice(0, 60);
  if (typeof out.summary === 'string') out.summary = out.summary.slice(0, 5000);
  else delete out.summary;
  if (out.completedTasks && (typeof out.completedTasks !== 'object' || Array.isArray(out.completedTasks))) delete out.completedTasks;
  if (out.completedTasks) out.completedTasks = Object.fromEntries(Object.entries(out.completedTasks).slice(0, 2000));
  if (out.verifiedResources) out.verifiedResources = Array.isArray(out.verifiedResources) ? out.verifiedResources.slice(0, 60) : undefined;
  if (out.pipeline) out.pipeline = Array.isArray(out.pipeline) ? out.pipeline.slice(0, 40) : undefined;
  if (out.createdAt !== undefined && typeof out.createdAt !== 'string') out.createdAt = String(out.createdAt);
  if (out.planKey !== undefined) out.planKey = String(out.planKey).slice(0, 64);
  if (out.targetScore !== undefined) out.targetScore = String(out.targetScore).slice(0, 24);
  if (out.scheduleMethod !== undefined) out.scheduleMethod = String(out.scheduleMethod).slice(0, 32);
  if (out.calendar && (!Array.isArray(out.calendar) || out.calendar.length !== days)) {
    delete out.calendar;
    delete out.progress;
  }
  if (out.allocation && (typeof out.allocation !== 'object' || Array.isArray(out.allocation))) delete out.allocation;
  if (out.progress) {
    const p = out.progress;
    const done = p && typeof p.done === 'object' && !Array.isArray(p.done) ? p.done : {};
    out.progress = { done: Object.fromEntries(Object.entries(done).filter(([, v]) => Number.isInteger(v)).slice(0, 2000)) };
    if (typeof p.onTrack === 'boolean') out.progress.onTrack = p.onTrack;
  }
  return JSON.parse(JSON.stringify(out));
}

/** Coach payloads use {dayStart, dayEnd}; the checklist uses {startDay, endDay}. */
export function toClientPhases(serverPhases) {
  return (serverPhases || []).map((p, i) => ({
    phaseTitle: String(p.phaseTitle || `Phase ${i + 1}`),
    focus: String(p.focus || ''),
    tasks: Array.isArray(p.tasks) ? p.tasks.map(String) : [],
    ...(Number.isInteger(p.dayStart) ? { startDay: p.dayStart } : {}),
    ...(Number.isInteger(p.dayEnd) ? { endDay: p.dayEnd } : {})
  }));
}
