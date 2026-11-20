/**
 * Roadmap orchestrator — plain code, no LLM. Runs each agent as a separate step and decides
 * what happens next from each result (v3, ARCHITECTURE.md §B.3 / §C step 2):
 *
 *   validate input -> planKey (exam, level, day bucket, quantised diagnostic profile)
 *   -> plan cache: per-instance LRU, then plans/{planKey} (dual-read: legacy global_verified_roadmaps)
 *        hit -> buildSchedule() for the EXACT days + cached wording -> done (0–1 reads, no LLM)
 *   -> exam profile + ranked shelf in parallel (1–2 reads); rankForPlan() picks the resources
 *        weighted by exam sections × diagnostic weakness; low-health entries re-checked over HTTP
 *   -> if < 3 usable: Discovery -> Copyright auditor (real link + paywall checks) -> library upsert
 *      -> shelf rebuild, retried once with excludeUrls; still < 3 -> 422
 *   -> buildSchedule() decides the plan (days, mocks, reviews, interleaving, resources)
 *   -> polishPlan() (LLM, optional) rewrites wording only; on failure the schedule IS the plan
 *   -> plans/{planKey} write + one usage-bucket write + counter shards -> roadmap (CONTRACT.md)
 *
 * Personalised plans are cached too (keyed by the quantised profile band).
 * @module lib/orchestrator
 */
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';
import { getShelf, rebuildShelf, upsertResource, markUsed, resourcesCol, SKILLS } from './library.js';
import { checkLink } from './linkCheck.js';
import { isOfficialUrl } from './allowlist.js';
import { discoverResources, LEVELS } from './agents/discovery.js';
import { auditResources, mapLimit } from './agents/copyrightAuditor.js';
import { getProfile } from './agents/examFormat.js';
import { polishPlan, MAX_RESOURCES } from './agents/planner.js';
import { bump } from './counters.js';
import { planKey, bucketDays, quantiseProfile } from './algo/keys.js';
import { KNOWN_EXAMS, normalizeVariant, profileForPlan, examLabel, variantMeta } from './exams.js';
import { rankForPlan, shelfEntry, nextLinkCheckAt } from './algo/rank.js';
import { buildSchedule, sectionWeightsFromProfile, skillNeeds } from './algo/schedule.js';
import { createLru } from './algo/lru.js';
import { usablePlan, assembleFromPlan, roadmapFrom, iso, PIPELINE_VERSION, CACHE_MAX_AGE_DAYS, MIN_RESOURCES } from './plans.js';

export { KNOWN_EXAMS };
const EXAM_PATTERN = /^[A-Z][A-Z0-9_-]{1,19}$/;
export { MIN_RESOURCES, PIPELINE_VERSION };
const LEGACY_PIPELINE_VERSION = 2;
const LOW_HEALTH = 0.6;
const DIAG_SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'];

export class InputError extends Error {}

/**
 * Validate and normalise the request body. Throws InputError (-> 400).
 * @returns {{exam: string, knownExam: boolean, level: string, days: number, forceRefresh: boolean, skillScores: Record<string, number>|null, variant: string|null}}
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
  let variant = null;
  if (body.variant != null && body.variant !== '') {
    if (typeof body.variant !== 'string') throw new InputError('"variant" must be a string.');
    variant = normalizeVariant(exam, body.variant);
    if (!variant) throw new InputError(`"variant" is not valid for ${exam}.`);
  } else {
    variant = normalizeVariant(exam, null);
  }
  return { exam, knownExam: KNOWN_EXAMS.includes(exam), level, days, forceRefresh: body.forceRefresh === true, skillScores, variant };
}

const tokens = (u) => (u ? u.total_tokens ?? (u.prompt_tokens || 0) + (u.completion_tokens || 0) : 0);
const legacyCacheDoc = (key) => pub().collection('global_verified_roadmaps').doc(key);
const plansCol = () => pub().collection('plans');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const planLru = createLru({ max: 300, ttlMs: 600000 });
/** Test seam: forget plans cached on this instance. */
export const clearPlanCache = () => planLru.clear();

/** Usage counters (sharded, ARCHITECTURE.md §B.5). Never breaks a request. */
async function bumpMetrics(fields) {
  await bump(fields);
}

export { assembleFromPlan };

/**
 * Save an audited resource to the shared library. Empty `levels` means "all levels".
 * (upsertResource no longer calls arrayUnion() with zero arguments, so no retry is needed.)
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
  return upsertResource(rec, { approved, addedBy });
}

/** Re-check ranked entries whose link health score is low (old check, error or unverified status). */
async function refreshStale(resources, trace) {
  const stale = resources.filter((r) => (r.components?.health ?? 1) < LOW_HEALTH);
  if (!stale.length) {
    trace.push({ agent: 'link_verifier', status: 'ok', detail: `${plural(resources.length, 'library link')} recently checked and healthy` });
    return resources;
  }
  const results = await mapLimit(stale, 4, async (r) => {
    const link = await checkLink(r.url).catch(() => ({ status: 'error', httpCode: null }));
    try {
      const next = nextLinkCheckAt({ id: r.id, status: link.status, now: Date.now() });
      await resourcesCol().doc(r.id).set({ linkStatus: link.status, httpCode: link.httpCode ?? null, lastCheckedAt: FieldValue.serverTimestamp(), nextCheckAt: new Date(next.nextCheckAt), checkIntervalDays: next.checkIntervalDays }, { merge: true });
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
      added.push({ id, url: p.url, title, category: p.category, skills: p.skills, exams: [exam], levels: p.levels, license: p.license, linkStatus: p.linkStatus, httpCode: p.httpCode, lastCheckedAt: p.checkedAt, discovered: true });
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
  const { exam, knownExam, level, days, forceRefresh, skillScores, variant } = input;
  const legacyKey = `${exam}-${level}-${days}`;
  const key = planKey({ exam, level, days, skillScores, variant });
  const personalised = Boolean(skillScores);
  const roadmapId = personalised ? `${legacyKey}-p-${randomUUID().slice(0, 8)}` : legacyKey;
  // Build-log text is shown to learners ("How we built it"): exam names, never ids or cache keys.
  const examName = variantMeta(exam, variant)?.label || examLabel(exam);
  const trace = [{ agent: 'orchestrator', status: 'ok', detail: `Request: ${examName}, ${level}, ${plural(days, 'day')}${personalised ? ', personalised by your level check' : ''}` }];
  const usage = { discovery: 0, planner: 0 };

  const finish = ({ sched, phases, summary, resources, examProfile, source, extraTrace = [] }) =>
    roadmapFrom({ id: roadmapId, exam, level, days, planKey: key, sched, phases, summary, resources, examProfile, pipeline: [...trace, ...extraTrace], source });

  try {
    // 1. Plan cache: instance LRU -> plans/{key} -> legacy global_verified_roadmaps (generic only)
    if (forceRefresh) {
      trace.push({ agent: 'global_cache', status: 'skipped', detail: 'forceRefresh requested' });
    } else {
      try {
        let c = planLru.get(key);
        if (!c) {
          const snap = await plansCol().doc(key).get();
          c = snap.exists ? snap.data() : null;
        }
        if (usablePlan(c)) {
          planLru.set(key, c);
          const a = assembleFromPlan(c, { exam, level, days, skillScores });
          await bumpMetrics({ cacheHits: 1 }); // 1 write per hit (ARCHITECTURE.md §B.10)
          return {
            status: 200,
            body: {
              roadmap: finish({
                ...a,
                examProfile: c.examProfile || null,
                source: 'global_cache',
                extraTrace: [{ agent: 'global_cache', status: 'ok', detail: `Reused a plan from the shared plan cache, rescheduled for exactly ${plural(days, 'day')}` }]
              })
            }
          };
        }
        if (!personalised) {
          const ls = await legacyCacheDoc(legacyKey).get();
          const lc = ls.exists ? ls.data() : null;
          const ageDays = lc?.cachedAt ? (Date.now() - Date.parse(lc.cachedAt)) / 864e5 : Infinity;
          if (lc?.serverVerified === true && lc.pipelineVersion === LEGACY_PIPELINE_VERSION && lc.roadmap && ageDays < CACHE_MAX_AGE_DAYS) {
            await bumpMetrics({ cacheHits: 1, legacyCacheHits: 1 });
            return {
              status: 200,
              body: {
                roadmap: {
                  ...lc.roadmap,
                  completedTasks: {},
                  source: 'global_cache',
                  pipeline: [...trace, { agent: 'global_cache', status: 'ok', detail: `served legacy shared roadmap built on ${lc.roadmap.createdAt}` }]
                }
              }
            };
          }
        }
        trace.push({ agent: 'global_cache', status: 'ok', detail: c ? 'Shared plan was outdated, so a fresh one is being built' : 'No shared plan yet, so a new one is being built' });
      } catch (err) {
        trace.push({ agent: 'global_cache', status: 'failed', detail: `cache read failed: ${err?.message || 'unknown'}` });
      }
    }

    // 2. Exam profile + ranked shelf, in parallel
    const [profRes, shelfRes] = await Promise.allSettled([getProfile(exam), getShelf(exam, level)]);
    let examProfile = null;
    if (profRes.status === 'fulfilled') {
      examProfile = profileForPlan(exam, { variant, level, extracted: profRes.value.profile });
      const usedOfficial = examProfile?.official && examProfile !== profRes.value.profile;
      trace.push({ agent: 'exam_format', status: examProfile ? 'ok' : profRes.value.status === 'failed' ? 'failed' : 'skipped', detail: usedOfficial ? `Official ${examName} format blueprint from ${examProfile.sourceUrl}` : profRes.value.detail });
    } else {
      examProfile = profileForPlan(exam, { variant, level, extracted: null });
      trace.push({ agent: 'exam_format', status: examProfile ? 'ok' : 'failed', detail: examProfile ? `official format blueprint from ${examProfile.sourceUrl}` : (profRes.reason?.message || 'unknown error') });
    }
    let sectionWeights = sectionWeightsFromProfile(examProfile);
    let skillWeights = skillNeeds(sectionWeights, skillScores);
    const rank = (entries) => rankForPlan(entries || [], { exam, level, skillWeights }, { k: MAX_RESOURCES }).filter((r) => isOfficialUrl(r.url));

    let resources = [];
    let shelfVersion = null;
    if (shelfRes.status === 'fulfilled') {
      const shelf = shelfRes.value;
      shelfVersion = typeof shelf.version === 'number' ? shelf.version : null;
      resources = rank(shelf.entries);
      trace.push({ agent: 'resource_library', status: 'ok', detail: `${plural(resources.length, 'ranked resource')} for ${examName} ${level} from the library (${(shelf.entries || []).length} on the shelf)` });
      if (resources.length) resources = await refreshStale(resources, trace);
    } else {
      trace.push({ agent: 'resource_library', status: 'failed', detail: `library lookup failed: ${shelfRes.reason?.message || 'unknown'}` });
    }
    if (!knownExam && !resources.length) {
      return { status: 400, body: { error: `"exam" must be one of ${KNOWN_EXAMS.join(', ')}.` } };
    }

    // 3. Discovery (only when the library is short)
    let discoveredUsed = false;
    if (resources.length >= MIN_RESOURCES) {
      trace.push({ agent: 'discovery', status: 'skipped', detail: `The library already has ${plural(resources.length, 'verified resource')}, so no outside search was needed` });
      trace.push({ agent: 'copyright_auditor', status: 'skipped', detail: 'Library resources were checked for free use when they were added' });
    } else {
      await bumpMetrics({ discoveryRuns: 1 });
      const exclude = new Set(resources.map((r) => r.url));
      let addedAny = false;
      for (let round = 1; round <= 2 && resources.length < MIN_RESOURCES; round++) {
        const { added, tried } = await discoverAndAudit({ exam, level, excludeUrls: [...exclude], round, trace, usage });
        for (const u of tried) exclude.add(u);
        const have = new Set(resources.map((r) => r.id));
        for (const a of added) if (!have.has(a.id)) { resources.push(a); discoveredUsed = true; addedAny = true; }
      }
      if (addedAny) {
        // Discovery may have just added the official exam-format page: re-ground, even if a code blueprint was already used as a fallback.
        try {
          const p = await getProfile(exam);
          examProfile = profileForPlan(exam, { variant, level, extracted: p.profile });
          if (examProfile) {
            sectionWeights = sectionWeightsFromProfile(examProfile);
            skillWeights = skillNeeds(sectionWeights, skillScores);
          }
          trace.push({ agent: 'exam_format', status: examProfile ? 'ok' : p.status === 'failed' ? 'failed' : 'skipped', detail: examProfile?.official && !p.profile ? `official format blueprint from ${examProfile.sourceUrl}` : p.detail });
        } catch (err) {
          trace.push({ agent: 'exam_format', status: 'failed', detail: err?.message || 'unknown error' });
        }
      }
      if (addedAny) {
        // Re-rank from the rebuilt shelf so the plan uses the same order as the next learner gets.
        try {
          const shelf = await rebuildShelf(exam, level);
          shelfVersion = typeof shelf.version === 'number' ? shelf.version : null;
          const reranked = rank(shelf.entries);
          if (reranked.length >= Math.min(MIN_RESOURCES, resources.length)) resources = reranked;
          trace.push({ agent: 'resource_library', status: 'ok', detail: `${examName} ${level} library shelf rebuilt with ${plural((shelf.entries || []).length, 'resource')}` });
        } catch (err) {
          trace.push({ agent: 'resource_library', status: 'failed', detail: `shelf rebuild failed: ${err?.message || 'unknown'}` });
        }
      }
    }
    if (resources.length < MIN_RESOURCES) {
      return {
        status: 422,
        body: {
          error: `Not enough verified official resources for ${examLabel(exam)} ${level} yet (found ${resources.length}, need ${MIN_RESOURCES}). Nothing unverified will be shown, so please try again later.`,
          pipeline: trace
        }
      };
    }
    resources = resources.slice(0, MAX_RESOURCES + 6);

    // 4. Deterministic schedule (this decides the plan)
    const sched = buildSchedule({ exam, level, days, skillScores, sectionWeights, resources });
    trace.push({ agent: 'scheduler', status: 'ok', detail: `${plural(sched.calendar.length, 'day')}: ${Object.entries(sched.allocation).filter(([, n]) => n).map(([s, n]) => `${s} ×${n}`).join(', ') || 'mixed practice'}` });

    // 5. Planner polishes the wording only (optional)
    let plan = { summary: sched.summary, phases: sched.phases.map(({ phaseTitle, focus, tasks, startDay, endDay }) => ({ phaseTitle, focus, tasks, startDay, endDay })) };
    let wording = null;
    const pr = await polishPlan({ exam, level, days, skeleton: sched, resources, examProfile });
    usage.planner += tokens(pr.usage);
    if (pr.ok) {
      plan = pr.plan;
      wording = pr.wording;
      trace.push({ agent: 'planner', status: 'ok', detail: `Wording polished for ${plural(plan.phases.length, 'phase')}${pr.usage ? `; ${tokens(pr.usage)} tokens` : ''}` });
    } else {
      trace.push({ agent: 'planner', status: 'failed', detail: `${pr.error}; used the deterministic schedule as written` });
      await bumpMetrics({ fallbackPlans: 1 });
    }

    // 6. Assemble
    const source = discoveredUsed ? 'live_discovery' : 'library';
    const roadmap = finish({ sched, phases: plan.phases, summary: plan.summary, resources, examProfile, source });

    await markUsed(resources.map((r) => r.id));

    // 7. Shared plan cache (generic and personalised plans alike; keyed by profile band)
    try {
      const now = new Date();
      const doc = {
        planKey: key,
        exam,
        level,
        bucket: bucketDays(days),
        profile: quantiseProfile(skillScores),
        pipelineVersion: PIPELINE_VERSION,
        shelfVersion,
        resourceIds: resources.map((r) => r.id),
        resources: resources.map((r) => JSON.parse(JSON.stringify(shelfEntry({ ...r, lastCheckedAt: iso(r.lastCheckedAt) })))),
        sectionWeights,
        examProfile: examProfile ? JSON.parse(JSON.stringify(examProfile)) : null,
        wording,
        source,
        cachedAt: now,
        expireAt: new Date(now.getTime() + CACHE_MAX_AGE_DAYS * 864e5)
      };
      await plansCol().doc(key).set(doc);
      planLru.set(key, doc);
      roadmap.pipeline.push({ agent: 'global_cache', status: 'ok', detail: `Saved to the shared plan cache${wording ? '' : ' (standard wording; polished again when the AI planner is available)'}` });
    } catch (err) {
      roadmap.pipeline.push({ agent: 'global_cache', status: 'failed', detail: `cache write failed: ${err?.message || 'unknown'}` });
    }
    await bumpMetrics({ roadmapsGenerated: 1, discoveryTokens: usage.discovery, plannerTokens: usage.planner });
    return { status: 200, body: { roadmap } };
  } catch (err) {
    console.error('[orchestrator] unexpected error', err);
    return { status: 500, body: { error: 'Roadmap generation failed unexpectedly. Please try again.', pipeline: trace } };
  }
}
