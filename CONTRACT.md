# OpenExam Hub server — shared contract (all agents MUST follow)

Runtime: Vercel Node 20 serverless functions, ESM (`export default async function handler(req, res)`), dependency `firebase-admin` only (plus Node built-ins / global fetch). No other npm deps unless essential; add them to package.json.
Shared libs already exist — reuse, don't duplicate: `lib/allowlist.js` (isOfficialUrl, normalizeUrl, OFFICIAL_DOMAIN_ALLOWLIST), `lib/linkCheck.js` (checkLink -> {status: ok|dead|unverified|off_allowlist|error, httpCode, finalUrl}), `lib/llm.js` (generateJson({agent, system, prompt, schema, validate}) -> {data, usage, model}; S = standard JSON Schema helpers; `agent` is one of DISCOVERY|PLANNER|FORMAT|DIAGNOSTIC|COACH|PRACTICE|EXPANSION and picks the model via LLM_MODEL_<AGENT>; ALWAYS pass a `validate(data)` that returns an error string or null — free models drift from the schema, and validate failures are retried automatically), `lib/firebaseAdmin.js` (db, APP_ID, pub() = doc artifacts/{APP_ID}/public/data), `lib/library.js` (findResources, upsertResource, markUsed, resourceId, SKILLS), `lib/http.js` (cors, rawBody).

Firestore layout (all under artifacts/{APP_ID}/):
- public/data/resources/{id}            shared resource library (server-written only). Fields: url,title,category,skills[],exams[],levels[],license,linkStatus,httpCode,lastCheckedAt,firstAddedAt,approved,addedBy,usageCount
- public/data/exam_profiles/{EXAM}      exam format fact sheets (server-written; reviewed:false until a human sets true)
- public/data/global_verified_roadmaps/{EXAM-LEVEL-DAYS}  shared roadmap cache (server-written only)
- public/data/practice_sets/{key}       generated practice items cache (server-written only)
- public/data/treasury/monthly_ledger   funding totals (server-written only; webhooks)
- public/data/ledger_events/{source-eventId}  public donation feed (server-written only)
- public/data/metrics/usage             counters (server-written only)
- users/{uid}/roadmaps/{id}             owner-only, client-written

Roadmap object (what the client renders):
{ id, exam, level, days, createdAt:'YYYY-MM-DD', summary, completedTasks:{},
  verifiedResources:[{ id, title, url, license, category, linkStatus, lastCheckedAt(ISO|null) }],
  phases:[{ phaseTitle, focus, tasks:[string] }],
  examProfile?: { sections:[...], sourceUrl, reviewed },
  pipeline:[{ agent, status:'ok'|'skipped'|'failed', detail }],
  source:'global_cache'|'library'|'live_discovery' }

HTTP API (JSON, CORS via lib/http.js cors()):
- POST /api/generate-roadmap  {exam, level, days, forceRefresh?, diagnostic?:{skillScores:{listening:0..1,...}}} -> {roadmap}
- GET  /api/check-link?url=   -> {url, status, httpCode, finalUrl}  (Cache-Control s-maxage=86400)
- GET  /api/library?exam=&level=&skill= -> {resources:[...]}
- POST /api/diagnostic        {action:'create', exam, level} -> {quizId, questions:[{id, skill, prompt, options[], answerIndex, explanation}]}
                              {action:'score', exam, level, answers:[{id, skill, correct:bool}]} -> {skillScores, estimatedLevel, advice}
- POST /api/coach             {roadmap, daysElapsed} -> {onTrack:bool, summary, rebalancedPhases:[...same shape...], tips:[string]}
- POST /api/practice          {exam, level, skill, count<=10} -> {items:[{id, skill, prompt, options?, answer, explanation}], disclaimer}
- POST /api/webhooks/github-sponsors | /api/webhooks/kofi | /api/webhooks/open-collective   (signature-verified, idempotent)
- GET  /api/cron/recheck-links (Vercel cron; Authorization: Bearer CRON_SECRET)
- POST /api/admin/expand  {exam, levels[]}  (Authorization: Bearer ADMIN_SECRET) -> candidate resources saved approved:false
- POST /api/admin/approve {resourceIds[], approve:bool} (ADMIN_SECRET); POST /api/admin/review-profile {exam, reviewed:bool}

Hard rules for every agent:
1. Never present an unchecked URL as verified. Only allowlisted (isOfficialUrl) URLs that passed checkLink (ok, or unverified=exists but bot-blocked, labeled as such) enter the library or a roadmap.
2. The LLM never invents facts about exam formats, licenses, or URLs that then get shown as verified. Exam format facts must be extracted from fetched official page text and carry sourceUrl.
3. Generated practice content is ORIGINAL and labeled "Unofficial practice — not from the exam board". Never reproduce official items.
4. Validate all inputs (exam in a known set or allowlisted pattern, level in A1..C2, days 1..180, counts bounded). Return 400 on bad input, never 500 with a stack.
5. All LLM calls go through lib/llm.js (OpenAI-compatible, routed via a self-hosted OmniRoute gateway). It records usage itself. Never call a provider directly, never hardcode a model.
6. Keep each agent a pure module in lib/agents/<name>.js (export async functions, no req/res) and a thin route in api/. Every agent must degrade gracefully: on LLM failure return a clear error status the orchestrator can handle.
Known exams: TCF, TEF, DELF, DALF, IELTS, CAMBRIDGE, GOETHE, TELC, TESTDAF (expansion may add more).
