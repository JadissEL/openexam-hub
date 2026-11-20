# OpenExam Hub server — shared contract (all agents MUST follow)

Runtime: Vercel Node 24 serverless functions (fra1), ESM (`export default async function handler(req, res)`). Route handlers live in `lib/routes/` and are mounted by the `api/` dispatchers (max 12 functions on Hobby; see DEPLOY.md), dependency `firebase-admin` only (plus Node built-ins / global fetch). No other npm deps unless essential; add them to package.json.
Shared libs already exist — reuse, don't duplicate: `lib/allowlist.js` (isOfficialUrl, normalizeUrl, OFFICIAL_DOMAIN_ALLOWLIST), `lib/linkCheck.js` (checkLink -> {status: ok|dead|unverified|off_allowlist|error, httpCode, finalUrl}), `lib/llm.js` (generateJson({agent, system, prompt, schema, validate}) -> {data, usage, model}; S = standard JSON Schema helpers; `agent` is one of DISCOVERY|PLANNER|FORMAT|DIAGNOSTIC|COACH|PRACTICE|EXPANSION and picks the model via LLM_MODEL_<AGENT>; ALWAYS pass a `validate(data)` that returns an error string or null — free models drift from the schema, and validate failures are retried automatically), `lib/firebaseAdmin.js` (db, APP_ID, pub() = doc artifacts/{APP_ID}/public/data), `lib/library.js` (getShelf, rebuildShelf, rebuildShelves, findResources, upsertResource, markUsed, resourceId, SKILLS), `lib/http.js` (cors, rawBody), `lib/counters.js` (bump, recordUsage: sharded hot counters), `lib/plans.js` (plan cache helpers), `lib/algo/*` (pure, deterministic algorithms: rank, schedule, srs, placement, progress, keys, lru, index; see ARCHITECTURE.md).
Principle: **the AI writes words; the algorithms make the decisions** (ranking, schedule, pace/on-track, placement, review timing, cache keys).

Firestore layout (all under artifacts/{APP_ID}/):
- public/data/resources/{id}            shared resource library (server-written only). Fields: url (canonical),title,category,skills[],exams[],levels[],license,linkStatus,httpCode,lastCheckedAt,firstAddedAt,approved,addedBy,usageCount,completionCount,
                                        v3: site,dedupKey,tier,shelfKeys[],nextCheckAt,checkIntervalDays,consecutiveDead,duplicateOf?
                                        usageCount/completionCount are folded nightly from usage_buckets (never written on the request path).
- public/data/shelves/{EXAM}_{LEVEL}    precomputed ranked shelf: {entries[≤ ~90 shelfEntry], bySkill:{skill:[ids]}, version (build ms), builtAt, count}
- public/data/plans/{planKey}           v3 shared plan cache, planKey = EXAM_LEVEL_bucket[_profile] (lib/algo/keys.js): ranked resource snapshots,
                                        resourceIds[], wording{summary, phases{kind:{title,focus}}}|null, sectionWeights, examProfile, pipelineVersion 3, cachedAt, expireAt (TTL)
- public/data/exam_profiles/{EXAM}      exam format fact sheets (server-written; reviewed:false until a human sets true)
- public/data/item_sets/{EXAM}_{LEVEL}  calibrated item difficulties {b:{itemKey:θ}, n:{itemKey:count}} (nightly rollup)
- public/data/stats/public              public numbers (nightly rollup)
- public/data/counters/{name}/shards/{0..9}, usage_buckets/{shard}_{yyyymmddhh}, calib_buckets/*, link_checks/*   server-only (not client-readable)
- public/data/global_verified_roadmaps/{EXAM-LEVEL-DAYS}  LEGACY v2 cache: read-only fallback, no longer written; removed after the migration
- public/data/practice_sets/{key}       generated practice items cache (server-written only)
- public/data/treasury/monthly_ledger   funding totals (server-written only; webhooks)
- public/data/ledger_events/{source-eventId}  public donation feed (server-written only)
- public/data/metrics/usage             counters (server-written only)
- users/{uid}/roadmaps/{id}             owner-only, client-written (validated: ≤ 30 keys, progress map, calendar ≤ 180)
- users/{uid}/srs/{itemId}              owner-only spaced-repetition cards (FSRS state; validated keys)
- users/{uid}/placement/{EXAM}          owner-only placement sessions (validated)

Roadmap object (what the client renders):
{ id, exam, level, days, createdAt:'YYYY-MM-DD' (day 1 of the plan; the App sets the learner's local date), summary, completedTasks:{},
  planKey, scheduleMethod:'deterministic_v1',
  calendar:[string × days]   compact day codes (lib/algo/schedule.js compactCalendar/expandCalendar); calendarTasks() turns them into
                             checkable tasks with stable keys 'd{day}t{i}'. Missing on legacy/rebalanced roadmaps (phase checklist instead).
  allocation:{skill: studyDays}, progress:{ done:{ taskKey: epochSeconds }, onTrack? },
  verifiedResources:[{ id, title, url, license, category, linkStatus, lastCheckedAt(ISO|null) }],
  phases:[{ phaseTitle, focus, tasks:[string] }],
  examProfile?: { sections:[...], sourceUrl, reviewed },
  pipeline:[{ agent, status:'ok'|'skipped'|'failed', detail }],
  source:'global_cache'|'library'|'live_discovery' }

HTTP API (JSON, CORS via lib/http.js cors()):
- POST /api/generate-roadmap  {exam, level, days, forceRefresh?, variant?, diagnostic?:{skillScores:{listening:0..1,...}}} -> {roadmap}
- GET  /api/check-link?url=   -> {url, status, httpCode, finalUrl}  (Cache-Control s-maxage=86400)
- GET  /api/library?exam=&level=&skill= -> {resources:[...rank, relevance], shelfVersion?}  (with level: served from the shelf; s-maxage=600 + ETag)
- GET  /api/plan?exam=&level=&days=[&profile=wms---][&variant=canada] -> {roadmap, polished} | 404 {planKey}   shared plan cache, rescheduled for exactly `days`
                              (s-maxage=3600). The App calls this BEFORE POST /api/generate-roadmap. profile = quantiseProfile(skillScores).
- GET  /api/stats             -> {stats|null}  (stats/public, s-maxage=300)
- POST /api/events            {type:'task_done', planKey, resourceId} -> 202  (resourceId must be cited by plans/{planKey}; rate-limited; no user id)
- POST /api/diagnostic        {action:'create', exam, level} -> {quizId, questions:[{id, skill, prompt, options[], answerIndex, explanation}]}
                              questions also carry itemKey + b (IRT difficulty)
                              {action:'score', exam, level, answers:[{id, skill, cefr?, itemKey?, b?, correct:bool}]} -> {skillScores, estimatedLevel, advice, method:'irt_eap'|'cefr_bands'|'overall_ratio', confidence?, theta?, se?, rawSkillScores?}
- POST /api/coach             {roadmap, daysElapsed?} -> {onTrack:bool, summary, rebalancedPhases:[...same shape...], tips:[string]}
                              v3 roadmaps (calendar + progress.done): daysElapsed derives from createdAt; onTrack/pace are DETERMINISTIC
                              (lib/algo/progress.js, EWMA + hysteresis) and the response adds method:'progress_v1', pace, plannedPace, requiredPace,
                              projectedFinishDay/Date, lateByDays, readiness. The LLM only words the rebalance; tasks are validated 1:1.
- POST /api/practice          {exam, level, skill, count<=10} -> {items:[{id, skill, prompt, options?, answer, explanation}], disclaimer}
- POST /api/webhooks/github-sponsors | /api/webhooks/kofi | /api/webhooks/open-collective   (signature-verified, idempotent)
- GET  /api/cron/recheck-links (Vercel cron; Authorization: Bearer CRON_SECRET) — due links only (nextCheckAt), rebuilds affected shelves
- GET  /api/cron/rollup        (nightly; CRON_SECRET) folds usage/calibration buckets, sums counters -> stats/public, rebuilds shelves
- POST /api/admin/expand  {exam, levels[]}  (Authorization: Bearer ADMIN_SECRET) -> candidate resources saved approved:false
- POST /api/admin/approve {resourceIds[], approve:bool} (ADMIN_SECRET); POST /api/admin/review-profile {exam, reviewed:bool}

Hard rules for every agent:
1. Never present an unchecked URL as verified. Only allowlisted (isOfficialUrl) URLs that passed checkLink (ok, or unverified=exists but bot-blocked, labeled as such) enter the library or a roadmap.
2. The LLM never invents facts about exam formats, licenses, or URLs that then get shown as verified. Exam format facts must be extracted from fetched official page text and carry sourceUrl.
3. Generated practice content is ORIGINAL and labeled "Unofficial practice — not from the exam board". Never reproduce official items.
4. Validate all inputs (exam in a known set or allowlisted pattern, level in A1..C2, days 1..180, counts bounded). Return 400 on bad input, never 500 with a stack.
5. All LLM calls go through lib/llm.js (OpenAI-compatible, routed via a self-hosted OmniRoute gateway). It records usage itself. Never call a provider directly, never hardcode a model.
6. Keep each agent a pure module in lib/agents/<name>.js (export async functions, no req/res) and a thin route in api/. Every agent must degrade gracefully: on LLM failure return a clear error status the orchestrator can handle.
Known exams: TCF, TEF, TEF_CANADA, DELF, DALF, IELTS, CAMBRIDGE, TOEFL, GOETHE, TELC, TESTDAF, DELE (single source: lib/exams.js; expansion may add more). TCF accepts an optional `variant` of `tout_public` (default) or `canada`.
