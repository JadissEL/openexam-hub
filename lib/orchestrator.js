/**
 * Roadmap orchestrator — plain code, no LLM. Runs each agent as a separate step and decides
 * what happens next from each result:
 *
 *   validate input
 *   -> global roadmap cache (skipped on forceRefresh or when a diagnostic personalises the plan)
 *   -> resource library first (stale entries re-checked with a real HTTP request)
 *   -> if < 3 usable: Discovery -> Copyright auditor (real link + paywall checks) -> library upsert,
 *      retried once with excludeUrls; still < 3 -> 422
 *   -> Exam format specialist (optional, degrades to "skipped/failed")
 *   -> Planner (LLM; deterministic fallback plan if it fails)
 *   -> markUsed -> global cache write (non-personalised only) -> roadmap (CONTRACT.md shape)
 *
 * LLM token usage is recorded by lib/llm.js itself (CONTRACT rule 5); this module adds
 * pipeline counters to metrics/usage and puts token counts in the pipeline trace.
 *
 * @module lib/orchestrator
 */
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';
import { findResources, upsertResource, markUsed, resourcesCol, SKILLS } from './library.js';
import { checkLink } from './linkCheck.js';
import { isOfficialUrl } from './allowlist.js';
import { discoverResources, LEVELS } from './agents/discovery.js';
import { auditResources, mapLimit } from './agents/copyrightAuditor.js';
import { getProfile } from './agents/examFormat.js';
import { planRoadmap, buildFallbackPlan, MAX_RESOURCES } from './agents/planner.js';

export const KNOWN_EXAMS = ['TCF', 'TEF', 'DELF', 'DALF', 'IELTS', 'CAMBRIDGE', 'GOETHE', 'TELC', 'TESTDAF'];
const EXAM_PATTERN = /^[A-Z][A-Z0-9_-]{1,19}$/;
export const MIN_RESOURCES = 3;
const PIPELINE_VERSION = 2;
const CACHE_MAX_AGE_DAYS = 30;
const DIAG_SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'];

export class InputError extends Error {}

/**
 * Validate and normalise the request body. Throws InputError (-> 400).
 * @returns {{exam: string, knownExam: boolean, level: string, days: number, forceRefresh: boolean, skillScores: Record<string, number>|null}}
 */
export function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Request body must be a JSON object.');
  const exam = typeof body.exam === 'string' ? body.exam.trim().toUpperCase() : '';
  if (!EXAM_PATTERN.test(exam)) throw new InputError(`"exam" must be one of ${KNOWN_EXAMS.join(', ')}.`);
  const level = typeof body.level === 'string' ? body.level.trim().toUpperCase() : '';
  if (!LEVELS.includes(level)) throw new InputError('"level" must be one of A1, A2, B1, B2, C1, C2.');
  const days = typeof body.days === 'string' && /^\d+$/.test(body.days.trim()) ? Number(body.days) : body.days;
  if (!Number.isInteger(days) || days < 1 || days > 180) throw new InputError('"days" must be a whole number from 1 to 180.');
  if (body.forceRefresh != null && typeof body.forceRefresh !== 'boolean') throw new InputError('"forceRefresh" must be a boolean.');
  let skillScores = null;
  if (body.diagnostic != null) {
    const ss = body.diagnostic?.skillScores;
    if (!ss || typeof ss !== 'object' || Array.isArray(ss)) throw new InputError('"diagnostic.skillScores" must be an object.');
    skillScores = {};
    for (const [k, v] of Object.entries(ss)) {
      if (!DIAG_SKILLS.includes(k)) throw new InputError(`Unknown skill "${k}" in diagnostic.skillScores.`);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new InputError(`diagnostic.skillScores.${k} must be a number from 0 to 1.`);
      skillScores[k] = v;
    }
    if (!Object.keys(skillScores).length) throw new InputError('"diagnostic.skillScores" is empty.');
  }
  return { exam, knownExam: KNOWN_EXAMS.includes(exam), level, days, forceRefresh: body.forceRefresh === true, skillScores };
}

const today = () => new Date().toISOString().slice(0, 10);
const iso = (t) => (t?.toDate ? t.toDate().toISOString() : typeof t === 'string' ? t : t instanceof Date ? t.toISOString() : null);
const tokens = (u) => (u ? u.total_tokens ?? (u.prompt_tokens || 0) + (u.completion_tokens || 0) : 0);
const cacheDoc = (key) => pub().collection('global_verified_roadmaps').doc(key);

async function bumpMetrics(fields) {
  try {
    const inc = {};
    for (const [k, v] of Object.entries(fields)) inc[k] = FieldValue.increment(v);
    await pub().collection('metrics').doc('usage').set({ pipeline: inc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch {
    /* metrics never break a request */
  }
}

/**
 * Save an audited resource to the shared library. Empty `levels` means "all levels".
 * Works around lib/library.js upsertResource() calling FieldValue.arrayUnion() with zero
 * arguments (which throws) by retrying with every CEFR level, which findResources treats the same.
 * @returns {Promise<string>} resource id
 */
export async function saveToLibrary(r, { exam, approved = true, addedBy = 'discovery' }) {
  const rec = {
    url: r.url,
    title: r.title,
    category: r.category,
    skills: (r.skills || []).filter((s) => SKILLS.includes(s)),
    exams: [...new Set([exam, ...(r.exams || [])])],
    levels: r.levels || [],
    license: r.license,
    linkStatus: r.linkStatus,
    httpCode: r.httpCode ?? null
  };
  if (!rec.skills.length) throw new Error('resource has no skills');
  try {
    return await upsertResource(rec, { approved, addedBy });
  } catch (err) {
    if (!rec.levels.length && /arrayUnion/i.test(String(err?.message))) {
      return upsertResource({ ...rec, levels: LEVELS }, { approved, addedBy });
    }
    throw err;
  }
}

/** Re-check library entries whose last check is older than the library's freshness window. */
async function refreshStale(resources, trace) {
  const stale = resources.filter((r) => !r.fresh);
  if (!stale.length) {
    trace.push({ agent: 'link_verifier', status: 'ok', detail: `${resources.length} library link(s) checked within the last 14 days` });
    return resources;
  }
  const results = await mapLimit(stale, 4, async (r) => {
    const link = await checkLink(r.url).catch(() => ({ status: 'error', httpCode: null }));
    try {
      await resourcesCol().doc(r.id).set({ linkStatus: link.status, httpCode: link.httpCode ?? null, lastCheckedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch { /* best effort */ }
    return { id: r.id, link };
  });
  const byId = new Map(results.map((x) => [x.id, x.link]));
  const dropped = [];
  const kept = resources.flatMap((r) => {
    const link = byId.get(r.id);
    if (!link) return [r];
    if (link.status === 'ok' || link.status === 'unverified') return [{ ...r, linkStatus: link.status, httpCode: link.httpCode ?? null, lastCheckedAt: new Date().toISOString() }];
    dropped.push(`${r.url} (${link.status})`);
    return [];
  });
  trace.push({
    agent: 'link_verifier',
    status: 'ok',
    detail: `re-checked ${stale.length} stale library link(s); ${dropped.length} dropped${dropped.length ? `: ${dropped.slice(0, 3).join(', ')}` : ''}`
  });
  return kept;
}

/** Discovery -> audit -> library upsert. Returns the newly verified resources (library shape). */
async function discoverAndAudit({ exam, level, excludeUrls, round, trace, usage }) {
  const disc = await discoverResources({ exam, level, excludeUrls });
  usage.discovery += tokens(disc.usage);
  if (!disc.ok) {
    trace.push({ agent: 'discovery', status: 'failed', detail: `round ${round}: ${disc.error}` });
    return { added: [], tried: [] };
  }
  trace.push({ agent: 'discovery', status: 'ok', detail: `round ${round}: ${disc.rawCount} suggested, ${disc.candidates.length} allowlisted new candidate(s)${disc.usage ? `, ${tokens(disc.usage)} tokens` : ''}` });
  const tried = disc.candidates.map((c) => c.url);
  if (!disc.candidates.length) {
    trace.push({ agent: 'copyright_auditor', status: 'skipped', detail: `round ${round}: no candidates to audit` });
    return { added: [], tried };
  }
  const audit = await auditResources(disc.candidates);
  const statusCount = {};
  for (const p of audit.passed) statusCount[p.linkStatus] = (statusCount[p.linkStatus] || 0) + 1;
  for (const r of audit.rejected) if (r.linkStatus) statusCount[r.linkStatus] = (statusCount[r.linkStatus] || 0) + 1;
  trace.push({
    agent: 'link_verifier',
    status: 'ok',
    detail: `round ${round}: real HTTP checks on ${disc.candidates.length} URL(s): ${Object.entries(statusCount).map(([k, v]) => `${v} ${k}`).join(', ') || 'none reached'}`
  });
  trace.push({
    agent: 'copyright_auditor',
    status: 'ok',
    detail: `round ${round}: ${audit.passed.length} passed, ${audit.rejected.length} rejected${audit.rejected.length ? ` (${audit.rejected.slice(0, 3).map((r) => r.reason).join('; ')})` : ''}`
  });
  const added = [];
  for (const p of audit.passed) {
    // Prefer the page's own <title> over the model's wording when we fetched it.
    const title = p.pageTitle || p.title;
    try {
      const id = await saveToLibrary({ ...p, title }, { exam, approved: true, addedBy: 'discovery' });
      // The URL may already be in the library with approved:false (an admin rejected it, the link
      // maintenance agent disabled it, or it awaits review from /api/admin/expand). upsert keeps that
      // flag, so it must not be shown in a roadmap or written to the shared cache.
      const stored = (await resourcesCol().doc(id).get()).data();
      if (stored && stored.approved === false) {
        trace.push({ agent: 'resource_library', status: 'skipped', detail: `${p.url} is in the library but not approved; not used` });
        continue;
      }
      added.push({ id, url: p.url, title, category: p.category, skills: p.skills, levels: p.levels, license: p.license, linkStatus: p.linkStatus, httpCode: p.httpCode, lastCheckedAt: p.checkedAt, discovered: true });
    } catch (err) {
      trace.push({ agent: 'resource_library', status: 'failed', detail: `could not save ${p.url}: ${err?.message || 'unknown'}` });
    }
  }
  return { added, tried };
}

/**
 * Run the full pipeline. Never throws.
 * @param {object} body  POST /api/generate-roadmap body
 * @returns {Promise<{status: number, body: object}>}
 */
export async function generateRoadmap(body) {
  let input;
  try {
    input = validateInput(body);
  } catch (err) {
    if (err instanceof InputError) return { status: 400, body: { error: err.message } };
    return { status: 400, body: { error: 'Invalid request.' } };
  }
  const { exam, knownExam, level, days, forceRefresh, skillScores } = input;
  const key = `${exam}-${level}-${days}`;
  const personalised = Boolean(skillScores);
  const trace = [{ agent: 'orchestrator', status: 'ok', detail: `request ${key}${personalised ? ' (personalised by diagnostic)' : ''}` }];
  const usage = { discovery: 0, planner: 0 };

  try {
    // 1. Global cache
    if (personalised || forceRefresh) {
      trace.push({ agent: 'global_cache', status: 'skipped', detail: personalised ? 'personalised plans are not cached globally' : 'forceRefresh requested' });
    } else {
      try {
        const snap = await cacheDoc(key).get();
        const c = snap.exists ? snap.data() : null;
        const ageDays = c?.cachedAt ? (Date.now() - Date.parse(c.cachedAt)) / 864e5 : Infinity;
        if (c?.serverVerified === true && c.pipelineVersion === PIPELINE_VERSION && c.roadmap && ageDays < CACHE_MAX_AGE_DAYS) {
          await bumpMetrics({ cacheHits: 1 });
          return {
            status: 200,
            body: {
              roadmap: {
                ...c.roadmap,
                completedTasks: {},
                source: 'global_cache',
                pipeline: [...trace, { agent: 'global_cache', status: 'ok', detail: `served shared roadmap built on ${c.roadmap.createdAt}` }]
              }
            }
          };
        }
        trace.push({ agent: 'global_cache', status: 'ok', detail: c ? 'cached entry ignored (unverified, outdated or expired)' : 'miss' });
      } catch (err) {
        trace.push({ agent: 'global_cache', status: 'failed', detail: `cache read failed: ${err?.message || 'unknown'}` });
      }
    }

    // 2. Library first
    let resources = [];
    try {
      resources = await findResources({ exam, level, limit: MAX_RESOURCES });
      resources = resources.filter((r) => isOfficialUrl(r.url));
      trace.push({ agent: 'resource_library', status: 'ok', detail: `${resources.length} approved resource(s) for ${exam} ${level}` });
      if (resources.length) resources = await refreshStale(resources, trace);
    } catch (err) {
      trace.push({ agent: 'resource_library', status: 'failed', detail: `library lookup failed: ${err?.message || 'unknown'}` });
    }
    if (!knownExam && !resources.length) {
      return { status: 400, body: { error: `"exam" must be one of ${KNOWN_EXAMS.join(', ')}.` } };
    }

    // 3. Discovery (only when the library is short)
    let discoveredUsed = false;
    if (resources.length >= MIN_RESOURCES) {
      trace.push({ agent: 'discovery', status: 'skipped', detail: `library already has ${resources.length} verified resource(s)` });
      trace.push({ agent: 'copyright_auditor', status: 'skipped', detail: 'library resources were audited when added' });
    } else {
      await bumpMetrics({ discoveryRuns: 1 });
      const exclude = new Set(resources.map((r) => r.url));
      for (let round = 1; round <= 2 && resources.length < MIN_RESOURCES; round++) {
        const { added, tried } = await discoverAndAudit({ exam, level, excludeUrls: [...exclude], round, trace, usage });
        for (const u of tried) exclude.add(u);
        const have = new Set(resources.map((r) => r.id));
        for (const a of added) if (!have.has(a.id)) { resources.push(a); discoveredUsed = true; }
      }
    }
    if (resources.length < MIN_RESOURCES) {
      return {
        status: 422,
        body: {
          error: `Not enough verified official resources for ${exam} ${level} yet (found ${resources.length}, need ${MIN_RESOURCES}). Nothing unverified will be shown, so please try again later.`,
          pipeline: trace
        }
      };
    }
    resources = resources.slice(0, MAX_RESOURCES);

    // 4. Exam format profile
    let examProfile = null;
    try {
      const p = await getProfile(exam);
      examProfile = p.profile;
      trace.push({ agent: 'exam_format', status: p.profile ? 'ok' : p.status === 'failed' ? 'failed' : 'skipped', detail: p.detail });
    } catch (err) {
      trace.push({ agent: 'exam_format', status: 'failed', detail: err?.message || 'unknown error' });
    }

    // 5. Planner (with deterministic fallback)
    let plan;
    let usedFallback = false;
    const pr = await planRoadmap({ exam, level, days, resources, examProfile, skillScores });
    usage.planner += tokens(pr.usage);
    if (pr.ok) {
      plan = pr.plan;
      const r = plan.repairs;
      const fixes = [
        r.urlsStripped && `${r.urlsStripped} URL(s) stripped`,
        r.unknownRefs && `${r.unknownRefs} unknown reference(s) removed`,
        r.rangesRepaired && 'day ranges repaired',
        r.phasesMerged && `${r.phasesMerged} phase(s) merged`,
        r.phasesSplit && `${r.phasesSplit} phase(s) split`
      ].filter(Boolean);
      trace.push({ agent: 'planner', status: 'ok', detail: `${plan.phases.length} phases over ${days} day(s)${fixes.length ? `; ${fixes.join(', ')}` : ''}${pr.usage ? `; ${tokens(pr.usage)} tokens` : ''}` });
    } else {
      plan = buildFallbackPlan({ exam, level, days, resources, skillScores });
      usedFallback = true;
      trace.push({ agent: 'planner', status: 'failed', detail: `${pr.error}; used the deterministic fallback plan` });
      await bumpMetrics({ fallbackPlans: 1 });
    }

    // 6. Assemble
    const roadmap = {
      id: personalised ? `${key}-p-${randomUUID().slice(0, 8)}` : key,
      exam,
      level,
      days,
      createdAt: today(),
      summary: plan.summary,
      completedTasks: {},
      verifiedResources: resources.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        license: r.license,
        category: r.category || 'Study resource',
        linkStatus: r.linkStatus,
        lastCheckedAt: iso(r.lastCheckedAt)
      })),
      phases: plan.phases.map((p) => ({ phaseTitle: p.phaseTitle, focus: p.focus, tasks: p.tasks, startDay: p.startDay, endDay: p.endDay })),
      ...(examProfile ? { examProfile } : {}),
      pipeline: trace,
      source: discoveredUsed ? 'live_discovery' : 'library'
    };

    try {
      await markUsed(resources.map((r) => r.id));
    } catch { /* usage counts are best effort */ }

    if (!personalised && !usedFallback) {
      try {
        const { pipeline, completedTasks, ...cacheable } = roadmap;
        await cacheDoc(key).set({ roadmap: { ...cacheable, pipeline: trace }, serverVerified: true, pipelineVersion: PIPELINE_VERSION, cachedAt: new Date().toISOString() });
        trace.push({ agent: 'global_cache', status: 'ok', detail: 'saved to the shared cache' });
      } catch (err) {
        trace.push({ agent: 'global_cache', status: 'failed', detail: `cache write failed: ${err?.message || 'unknown'}` });
      }
    } else {
      trace.push({ agent: 'global_cache', status: 'skipped', detail: personalised ? 'personalised plan not cached' : 'fallback plans are not cached' });
    }
    await bumpMetrics({ roadmapsGenerated: 1, discoveryTokens: usage.discovery, plannerTokens: usage.planner });
    return { status: 200, body: { roadmap } };
  } catch (err) {
    console.error('[orchestrator] unexpected error', err);
    return { status: 500, body: { error: 'Roadmap generation failed unexpectedly. Please try again.', pipeline: trace } };
  }
}
