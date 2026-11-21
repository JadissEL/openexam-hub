/**
 * GET /api/cron/warm-plans — keeps the most-requested shared plans built.
 * Authorization: Bearer CRON_SECRET (the daily Vercel cron) or OEH_OPS_SECRET (manual batches).
 *
 * For each target in WARM_TARGETS, in order, it reads plans/{planKey}. If the plan is missing,
 * outdated or unpolished, it is built by the SAME server path a learner's "Build my plan" uses
 * (lib/orchestrator.js generateRoadmap: library shelf -> link re-checks -> deterministic schedule ->
 * AI wording through the configured LLM router -> plans/{planKey}). No user account is involved and
 * nothing is invented: a plan is only saved when enough verified official resources exist.
 *
 *   ?status=1   list every target and whether its plan is ready; builds nothing
 *   ?max=N      build at most N plans this call (default 2, cap 4); one at a time, within a time
 *               budget, so the free-tier AI limits are respected
 *   ?only=TEF_CANADA:B2:30[:variant]  build just this target (if it is not ready)
 */
import { requireAnyBearer, sendJson } from '../../auth.js';
import { pub } from '../../firebaseAdmin.js';
import { generateRoadmap } from '../../orchestrator.js';
import { clearShelfCache } from '../../library.js';
import { usablePlan } from '../../plans.js';
import { planKey } from '../../algo/keys.js';
import { normalizeVariant, examLabel } from '../../exams.js';

const EXAMS = [
  { exam: 'TEF_CANADA' },
  { exam: 'TCF', variant: 'canada' },
  { exam: 'IELTS' },
  { exam: 'GOETHE' },
  { exam: 'DELE' },
  { exam: 'TOEFL' }
];
const LEVELS = ['B2', 'B1', 'C1'];
const DAYS = [30, 14, 60];

/** Ordered targets: TEF Canada B2 30 first, then by exam, level, length. */
export const WARM_TARGETS = EXAMS.flatMap(({ exam, variant }) =>
  LEVELS.flatMap((level) => DAYS.map((days) => ({ exam, level, days, variant: variant || null })))
);

const START_BUDGET_MS = 110000; // never start a new build after this (maxDuration is 300 s)

export function targetKey(t) {
  return planKey({ exam: t.exam, level: t.level, days: t.days, skillScores: null, variant: normalizeVariant(t.exam, t.variant) });
}
const label = (t) => `${t.variant === 'canada' ? 'TCF Canada' : examLabel(t.exam)} ${t.level} ${t.days}d`;

function parseOnly(s) {
  const m = /^([A-Z_]{2,20}):(A1|A2|B1|B2|C1|C2):(\d{1,3})(?::([a-z_]{2,20}))?$/.exec(String(s || ''));
  return m ? { exam: m[1], level: m[2], days: Number(m[3]), variant: m[4] || null } : null;
}

async function readiness(targets) {
  const col = pub().collection('plans');
  const keys = targets.map(targetKey);
  const snaps = await Promise.all(keys.map((k) => col.doc(k).get()));
  return targets.map((t, i) => {
    const doc = snaps[i].exists ? snaps[i].data() : null;
    return {
      target: label(t),
      planKey: keys[i],
      ready: usablePlan(doc),
      exists: !!doc,
      polished: !!doc?.wording,
      resources: Array.isArray(doc?.resources) ? doc.resources.length : 0,
      cachedAt: doc?.cachedAt?.toDate ? doc.cachedAt.toDate().toISOString() : null,
      t
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireAnyBearer(req, res, ['CRON_SECRET', 'OEH_OPS_SECRET'])) return;
  const started = Date.now();
  try {
    const q = req.query || {};
    const only = q.only ? parseOnly(q.only) : null;
    if (q.only && !only) return sendJson(res, 400, { error: 'only must look like TEF_CANADA:B2:30 or TCF:B2:30:canada' });
    // ?force=1 (only with ?only=) rebuilds one plan even if the cached copy is usable, e.g. after
    // new library resources land. Shelves are re-read from Firestore, not this instance's cache.
    const force = Boolean(only && q.force && q.force !== '0');
    if (q.force && !only) return sendJson(res, 400, { error: 'force needs only=EXAM:LEVEL:DAYS' });
    if (force) clearShelfCache();
    const targets = only ? [only] : WARM_TARGETS;
    const before = await readiness(targets);
    const strip = ({ t, ...rest }) => rest;
    if (q.status) {
      return sendJson(res, 200, { ready: before.filter((r) => r.ready).length, total: before.length, targets: before.map(strip) });
    }
    const max = Math.max(1, Math.min(4, Number(q.max) || 2));
    const built = [];
    for (const r of before) {
      if (r.ready && !force) continue;
      if (built.length >= max || Date.now() - started > START_BUDGET_MS) break;
      const t0 = Date.now();
      const out = await generateRoadmap({ exam: r.t.exam, level: r.t.level, days: r.t.days, ...(r.t.variant ? { variant: r.t.variant } : {}), ...(force ? { forceRefresh: true } : {}) });
      const rm = out.body?.roadmap;
      const resources = rm?.verifiedResources || [];
      const planner = (rm?.pipeline || out.body?.pipeline || []).find((p) => p.agent === 'planner');
      const saved = (rm?.pipeline || []).find((p) => p.agent === 'global_cache' && /^Saved/.test(p.detail || ''));
      built.push({
        target: r.target,
        planKey: r.planKey,
        status: out.status,
        error: out.status === 200 ? undefined : out.body?.error,
        source: rm?.source,
        saved: !!saved,
        polished: planner ? planner.status === 'ok' : false,
        plannerDetail: planner?.detail,
        resources: resources.length,
        linksOk: resources.filter((x) => x.linkStatus === 'ok').length,
        domains: [...new Set(resources.map((x) => { try { return new URL(x.url).hostname.replace(/^www\./, ''); } catch { return '?'; } }))],
        phases: rm?.phases?.length || 0,
        ms: Date.now() - t0
      });
      console.log('[warm-plans]', JSON.stringify(built[built.length - 1]));
    }
    const remaining = before.filter((r) => !r.ready).length - built.filter((b) => b.saved && b.polished).length;
    return sendJson(res, 200, { built, remaining, total: before.length, ms: Date.now() - started });
  } catch (err) {
    console.error('[warm-plans]', err?.message);
    return sendJson(res, 500, { error: 'warm-plans failed' });
  }
}
