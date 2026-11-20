# OpenExam Hub: algorithms and data model (v3 proposal)

Status: **the algorithm layer is written and tested** (`lib/algo/*`, `scripts/test-algo.mjs`, 41/41 passing).
**The data model below is a proposal.** No existing file was edited. The real `firestore.rules`, `firestore.indexes.json` and
server files change only when the checklist in §C is applied. The proposed rules were checked in the Firestore emulator (18/18 checks, §B.9).

Principle: **the AI writes words; the algorithms make the decisions.** Ranking, scheduling, review timing, level
estimation, pace and caching are all deterministic, pure functions. The output is the same for the same input, every function
is unit-tested, and the platform keeps working when every LLM is down. The LLM agents (discovery, exam format, planner
wording, coach wording, practice items) sit on top and are always optional.

---

## A. Algorithm layer: `lib/algo/`

All modules are pure ESM with no dependencies, no I/O and no `Math.random`, and the clock is passed in.
Everything except `keys.js` (which uses `node:crypto` for sha1) can also be bundled into the browser.
`index.js` is a barrel (`import { rank, schedule } from './lib/algo/index.js'`).

| File | What it decides | Known method it is based on | Hot-path cost |
|---|---|---|---|
| `common.js` | shared constants, largest-remainder apportionment, FNV-1a, popcount, site key | Hamilton / Hare–Niemeyer; FNV-1a | — |
| `keys.js` | cache keys, day buckets, profile bands, canonical URLs, resource ids, near-duplicates | RFC 3986 §6 normalisation; char-shingle Jaccard; MinHash + LSH banding (Broder 1997; Indyk & Motwani 1998); union-find | O(1) per key; O(n) expected dedup |
| `rank.js` | which library resources a plan uses, and in what order; when a link is re-checked next | weighted relevance; exponential evidence decay; Bayesian average (+ Wilson LB for admin); MMR (Carbonell & Goldstein 1998); exponential backoff | O(n log n) + O(M·k), M ≤ max(8k, 64) |
| `schedule.js` | day-by-day plan: skill per day, mocks, reviews, taper, phases | largest-remainder apportionment; stride scheduling (Waldspurger & Weihl 1995) for interleaving; expanding-interval reviews (Pimsleur / Leitner) | O(days × skills) |
| `srs.js` | when each flashcard / practice item is reviewed again | FSRS-4.5 (Ye et al., KDD 2022; open-spaced-repetition default weights) | O(1) per review; O(n log n) queue |
| `placement.js` | adaptive placement: next question, ability, CEFR level and confidence; item calibration | Rasch/1PL IRT with fixed guessing; EAP estimation (Bock & Mislevy 1982); max-Fisher-information selection (Lord 1980); Elo for items (Pelánek 2016) | ~3 ms per 15-item session |
| `progress.js` | expected vs actual progress, pace, projected finish, readiness, on-track decision | EWMA (Roberts 1959); Schmitt-trigger hysteresis | O(tasks) |
| `lru.js` | per-instance memory cache with TTL and single-flight loading | LRU via Map insertion order | O(1) |

### A.1 Ranking (`rank.js`)

`rankResources(resources, {exam, level, skill?, skillWeights?}, {k=12, lambda=0.7, maxPerSite=max(2,⌈k/4⌉), now})`

1. **Hard filters.** These are dropped: `approved:false` items, resources tagged for other exams (an empty `exams` list means "all exams"), resources more than 2 CEFR
   bands away, and links whose status is `dead`, `off_allowlist` or unknown.
2. **Relevance** = 0.25·level + 0.25·skill + 0.20·tier + 0.15·health + 0.15·quality, where each part is in [0,1]:
   - *level*: an exact tag scores 1, an untagged resource (all levels) 0.7, one band away 0.6, and two bands away 0.25.
   - *skill*: a resource tagged with the requested skill scores 1, `exam_format`/`mock_exam` scores 0.35, and others 0.1. With `skillWeights`, the score is the sum of the resource's
     skill weights divided by the largest weight.
   - *tier*: the board for this exam scores 1 (e.g. goethe.de for GOETHE), another exam board 0.85, a public broadcaster
     (TV5MONDE, RFI, DW) 0.75, and any other allowlisted site 0.6.
   - *health*: the base score is 1 for `ok`, 0.65 for `unverified` and 0.3 for `error`. It is pulled toward 0.5 with a 30-day half-life since `lastCheckedAt`
     (a link checked 90 days ago counts as "probably fine").
   - *quality*: a **Bayesian average** of the completion rate, (completions + 10·0.5)/(uses + 10). A brand-new resource sits at
     0.5 instead of 0, so new items are not buried. `wilsonLowerBound()` is exported for the "most reliable" admin views.
3. **Diversity.** Greedy **MMR**: pick the item with the highest λ·rel − (1−λ)·max sim(item, picked), where sim = 0.6·[same site] +
   0.4·Jaccard(skill bitmasks). On top of that there is a soft per-site cap, which is relaxed only when nothing else is left (the output marks this with
   `siteCapRelaxed:true`). The result is that a plan is never 5 links from one site when other sites exist.
4. **Determinism.** Ties break on `id`, so shuffled input gives identical output (tested).
- `rankForPlan()` guarantees at least one resource for every weighted skill when the library has one.
- `shelfEntry()` is the ~250-byte summary stored on shelf docs.
- `nextLinkCheckAt({id, status, prevIntervalDays, now})` sets the next check: `ok` links back off 7→14→30 days, `unverified` links wait 7 days,
  `error` links wait 1 day and double up to 7, and `dead` links are re-checked after 1 day (so the second strike comes fast). A deterministic ±10 % jitter by id spreads cron load.

### A.2 Scheduling (`schedule.js`)

`buildSchedule({exam, level, days, skillScores?, sectionWeights?|examProfile?, resources (ranked), dailyMinutes=60})`
returns `{summary, phases[], calendar[], allocation, needs, method:'deterministic_v1'}`.

1. **Fixed days**:
   - Day 1 is orientation and baseline (plans of 3+ days).
   - **Mock exams** fall at about 40 %, 70 % and 90 % of the plan, with an extra one at 20 % for plans of 60+ days. Plans of 7–13 days get 2 mocks (50 %, 90 %), plans of 4–6 days get 1, and plans of 1–3 days get none.
   - The **taper** is the exam eve, plus the day before for plans of 21+ days.
   - **Review days** follow an expanding ladder (+3, +5, +8, +13, then every 14 days). The ladder is capped so long plans keep reviewing.
   - Collisions move a day to the nearest free day.
2. **Needs**: section weight × (1 + 1.5·(1 − diagnostic score)). `sectionWeightsFromProfile()` maps official section names
   in FR/DE/EN (e.g. "Compréhension orale", "Hören", "Use of English") to skills by duration, blended 70/30 with the defaults.
   Without a profile, the defaults are listening/reading/writing/speaking at 0.2 each and grammar/vocabulary at 0.1 each.
3. **Apportionment**: study days are allocated by **largest remainder**. Each skill gets at least 1 day when possible, and each is capped at ⌊(2n+2)/3⌋
   so the interleaving rule stays feasible.
4. **Interleaving**: **stride scheduling** sets the ideal slot of a skill's j-th session at (j+½)·n/count_s. The scheduler takes the earliest ideal slot
   that does not create a 3-day run, and puts a skill first when it would otherwise run out of room. The result is never more than 2 consecutive days of one
   skill. This was property-tested on 20,000 random allocations and on every plan length from 1 to 180 days. If all the weight is on one skill, the gaps are filled with "mixed" days.
5. **Resources** are used round-robin in rank order (the best resource is used most, labelled "session 2, 3 …"). If a skill has no
   resource, the scheduler uses the skill section of a mock-exam resource, or else a plain task that says no verified resource exists yet. It never invents a link.
6. **Phases** come in fixed kinds (orientation ≤ 7 days, foundations, skill building, exam practice, final review), and there are 1–5 of them. This is
   compatible with the current roadmap shape and `planner.checkPlan` (contiguous 1..days, `Days a–b:` prefix). Each phase has at most 10 task strings: days are grouped
   into blocks of ⌈len/10⌉, e.g. "Days 64–69 — Listening ×1, Reading ×1 …; mock exam on day 72".
7. **Storage**: `compactCalendar()` encodes each day as "type.skill.resourceIdx.minutes". That is about 2 KB for 180 days, against 62 KB for the full
   calendar. Firestore has no nested arrays, hence the strings. `expandCalendar()` reverses it.

The LLM planner then **only rewrites wording** (summary, phase titles and focus, task phrasing 1:1). If it fails, this schedule is
the plan, so `buildFallbackPlan` becomes obsolete.

### A.3 Spaced repetition (`srs.js`)

`nextReview(card, grade 1..4 | 'again'|'hard'|'good'|'easy', now, {requestRetention=0.9, maximumInterval=365, fuzz=false})`

This is FSRS-4.5 with the published default weights: retrievability R = (1 + 19/81·t/S)^−0.5, difficulty with mean reversion, and
separate stability updates after a successful recall and after a lapse. Two simplifications: there is no same-day short-term model ("Again" uses one 10-minute
relearning step), and the optional fuzz is deterministic, seeded by card id. Helpers:
- `newCard(id)` and `previewIntervals(card)`, for "Again 10m · Hard 2d · Good 4d · Easy 12d" buttons;
- `gradeFromAnswer({correct, confident, ms})`, which maps quiz answers to grades;
- `dueQueue(cards, now)`, which puts the most-forgotten cards first, then up to 10 new ones;
- `retention(cards, now)`, which gives the mean R overall and per skill and feeds readiness.

Cards are plain JSON and are stored as-is (§B.6).

### A.4 Adaptive placement (`placement.js`)

The scale is A1 −2.5 … C2 +2.5 (one logit per band), and anything under −3 is pre-A1. The model is P(correct) = 0.25 + 0.75·σ(θ − b), a 1PL with fixed
guessing for 4-option multiple choice (`guess:0` gives pure Rasch).
- **Estimation**: EAP on a 121-point grid with the prior N(target level, 1.25²). It stays finite for all-correct and all-wrong patterns, and the posterior SD is the SE.
  Per-skill θ shrinks toward the overall θ (prior SD 0.9), so 2 answers in one skill can't swing it to an extreme.
- **Selection**: the least-measured skill comes first (content balancing). Within it, the item with the **maximum Fisher information** at the current θ̂ is chosen,
  with ties broken by hash(seed, id), so the run is deterministic. No item repeats.
- **Stopping**: the session stops when SE ≤ 0.6 once every skill has at least 1 item and at least 6 items are answered, or at **15 items**, or when the bank runs out.
- **Output**: `report()` returns `{estimatedLevel, confidence (posterior mass in that band), theta, se, skillScores 0..1, perSkill}`.
  `skillScores[s]` = σ(θ_s − b_target) = the chance of handling target-level items. That is the same 0..1 contract that
  `/api/generate-roadmap` already accepts.
- **Non-adaptive mode**: `scoreFixed({targetLevel, answers:[{id, skill, cefr, correct}]})` scores today's 12-question quiz with
  the same model and the same output shape.
- **Calibration**: `eloUpdate({theta, b, n, correct})` uses K(n) = 0.4/(1+n/20), so an item's difficulty settles as answers accumulate.
- **Measured on simulated learners** (600 runs with random true level and random target): a 15-item adaptive session has a mean |θ̂ − θ| of **0.76 logits**, gets the
  exact band **42 %** of the time and lands within ±1 band **86 %** of the time. The current fixed 12-question form scored with the same model is
  worse: a mean error of 0.96 and 34 % exact. Treat both as rough self-checks: 15 four-option questions cannot place anyone precisely
  (the SE stays around 0.65 logits). The product copy must keep saying "self-check, not an official placement".

### A.5 Pace and readiness (`progress.js`)

`assessProgress({days, startDate, now, totalTasks, completedAt[], calendar?, bySkill?, abilityScores?, retentionBySkill?, sectionWeights?, previous?})`

- **Expected**: the share of planned tasks up to the middle of today, taken from the calendar (so mock and review days count properly). Without a calendar it is linear.
- **Pace**: an **EWMA** of tasks per day (α = 2/8), seeded with the planned rate. It covers every elapsed day, so a stalled plan decays to about 0.
- **Projection**: today + remaining / pace, which gives `projectedFinishDay`, `projectedFinishDate` and `lateByDays`. If the pace is about 0 there is no projection.
  It also returns `requiredPace`.
- **On-track with hysteresis**: an on-track plan becomes "behind" only when gap < −15 points or the projected finish is more than 3 days late. A behind plan returns to on-track only when gap ≥ −5
  points and the projection is not late. Feed `previous: {onTrack}` from the stored roadmap.
- **Readiness** per skill = 0.45·ability + 0.35·completion share + 0.20·SRS retention, re-normalised over whichever parts exist.
  The overall figure is weighted by exam section weights, and the result names the 2 weakest skills.

The coach agent receives these numbers and only explains them. The coach's `onTrack` comes from here, not from the LLM.

### A.6 Keys and dedup (`keys.js`)

- `bucketDays(d)` snaps to the nearest of 7/14/30/60/90/180 on a log scale (ties go up). For example, 10→14, 21→30, 45→60 and 120→90.
  **Only the expensive parts are shared by bucket**: the ranked resource list, the exam profile and the LLM wording. The schedule is
  recomputed for the exact `days` in under 1 ms, so a 28-day learner still gets a 28-day plan.
- `quantiseProfile(skillScores)` gives 6 characters in a fixed skill order, each `w` (<0.4), `m` (<0.7), `s` or `-`, so `{listening:.2, speaking:.95}` becomes `w--s--`.
  That allows at most 729 profiles per (exam, level, bucket). Because the bands are coarse, **personalised plans become cacheable**.
- `planKey()` produces `TCF_B2_30` or `TCF_B2_30_w--s--`, and `shelfKey()` produces `TCF_B2`.
- `canonicalUrl()`:
  - lower-cases the host;
  - drops the default port, the fragment and ~25 tracking parameters (`utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_*`, `xtor` …);
  - sorts the remaining query, collapses `//` and trims the trailing `/`.
  It is idempotent and gives the same output as `allowlist.normalizeUrl` for URLs without a query (tested).
- `resourceIdFor(url)` is the first 24 hex characters of sha1(canonicalUrl).
- `dedupKey()` is looser and only used for duplicate detection. It strips `www.`/`m.`, replaces locale segments (`en`, `fr-FR`, `en_gb`) with `*` and drops `index.html`.
- `findNearDuplicates(resources)` uses an exact `dedupKey` match, or the same site plus title character-3-shingle Jaccard ≥ 0.8. Candidates come from
  64-hash **MinHash** with 16×4 **LSH bands**, are confirmed with exact Jaccard, and are merged by union-find. It matches brute force exactly on the test set.

### A.7 Test results and benchmarks

`npm run test:algo` (or `node scripts/test-algo.mjs`) runs 41 tests: properties, edge cases (1, 2, 3 … 180 days, all skills weak or all strong, a single skill,
an empty library, a null library), determinism (shuffled input, repeated runs), purity (no mutation, no `node:` or `Math.random` in browser-safe modules) and the micro-benchmarks below.
Timings were measured on the box:

| Benchmark | Result | Target |
|---|---|---|
| Rank 5,000 resources (k = 12) | **~4.5–5.3 ms** | < 50 ms ✅ |
| Rank 50,000 resources (k = 40), including fixture build | ~160–175 ms | — |
| Near-duplicate scan, 5,000 resources (MinHash LSH) | ~290–350 ms (cron/admin job only) | < 1 s ✅ |
| Build a 180-day schedule | **~0.4 ms** | < 20 ms ✅ |
| FSRS: 100,000 `nextReview` calls | ~16 ms | — |
| Adaptive placement session (15 items, 108-item bank) | ~3 ms | < 50 ms ✅ |

---

## B. Firestore data model

### B.1 Layout and naming

The `artifacts/{appId}/…` prefix is kept, because Gemini Canvas preview requires it and today's rules and code use it. Below, `P` stands for
`artifacts/{appId}/public/data` and `U` for `artifacts/{appId}/users/{uid}`. Writers marked **S** are server-only (firebase-admin) and those marked **C** are the owning client.

| Path | Doc id | Writer | Read by | Purpose |
|---|---|---|---|---|
| `P/resources/{rid}` | `sha1(canonicalUrl)[0:24]` | S | server (shelf rebuild, admin) | the source of truth for every verified resource |
| `P/shelves/{EXAM}_{LEVEL}` | e.g. `TCF_B2` | S | **hot path** (1 read), `/api/library` | the top ~40 ranked resource summaries for that exam and level |
| `P/plans/{planKey}` | `TCF_B2_30` or `TCF_B2_30_w--s--` | S | **hot path** | the cached plan skeleton: ranked resource ids, profile snapshot and LLM wording |
| `P/exam_profiles/{EXAM}` | `TCF` | S | server, client | exam format facts from official pages (unchanged) |
| `P/item_sets/{EXAM}_{LEVEL}` | `TCF_B2` | S | client (placement) | up to ~150 placement items with calibrated `b` in one doc |
| `P/item_bank/{itemId}` | `sha1(exam+prompt)[0:16]` | S | server | per-item calibration state `{b, n}` |
| `P/practice_sets/{key}` | unchanged | S | client | generated practice sets (unchanged) |
| `P/ledger_events/{source}-{eventId}` | e.g. `kofi-8f1c…` | S | client feed | append-only donations (unchanged: already idempotent) |
| `P/treasury/monthly_ledger` | fixed | S | client | the current month's totals (unchanged) |
| `P/treasury/{YYYY-MM}` | `2026-10` | S | client | the monthly summary archive (unchanged) |
| `P/stats/public` | fixed | S (rollup cron) | client, `/api/stats` | precomputed public numbers in one read |
| `P/counters/{name}/shards/{0..9}` | shard number | S | rollup cron only | sharded hot counters |
| `P/usage_buckets/{shard}_{yyyymmddhh}` | e.g. `3_2026112014` | S | rollup cron only | per-resource usage and completion increments |
| `P/calib_buckets/{shard}_{EXAM}_{LEVEL}` | e.g. `7_TCF_B2` | S | calibration cron | per-item Elo error sums |
| `P/link_checks/{rid}_{yyyymmdd}` | | S | admin | the link-check log (TTL 90 days) |
| `U` (doc) | uid | C | C | profile: `displayName?`, `prefs{}`, `placementSummary{EXAM:{level, confidence, at}}` |
| `U/roadmaps/{roadmapId}` | `planKey` or `planKey-p-xxxx` | C | C | the saved plan plus its **progress map** |
| `U/srs/{itemId}` | the item id | C | C | one FSRS card per vocabulary or practice item |
| `U/placement/{EXAM}` | `TCF` | C | C | the adaptive session state and report |

Dropped once the migration finishes: `P/global_verified_roadmaps` (replaced by `plans`) and `P/metrics/usage` (replaced by counters and `stats/public`).
`P/metrics/link_health` can stay as the cron's run summary.

### B.2 Document schemas (field: type)

**resources/{rid}**: the existing fields, plus the new ones marked ★
```
url: string (canonical)          title: string           category: string
skills: string[] (≤ 8)           exams: string[] (≤ 20)  levels: string[] (≤ 6, [] = all)
license: string                  linkStatus: 'ok'|'unverified'|'error'|'dead'|'off_allowlist'
httpCode: int|null               lastCheckedAt: timestamp   firstAddedAt: timestamp
approved: bool                   addedBy: string         consecutiveDead: int   deadSince?: timestamp
usageCount: int                  ★completionCount: int   ★site: string ('goethe.de')
★dedupKey: string                ★duplicateOf?: string (rid)   ★tier: number
★nextCheckAt: timestamp          ★checkIntervalDays: int        ★shelfKeys: string[] ('TCF_B2', …)
```
`usageCount` and `completionCount` are **written only by the rollup cron** from `usage_buckets`, never on the request path.

**shelves/{EXAM}_{LEVEL}**: about 10–12 KB, well under the 1 MiB limit
```
exam: string, level: string, version: int (increments on every rebuild), builtAt: timestamp,
entries: [ shelfEntry ] (≤ 40, ranked by rankResources with no skill and k = 40, maxPerSite = 10),
bySkill: { listening: [rid…≤10], … }   // pre-ranked per-skill lists for /api/library?skill=
count: int                             // resources considered
```

**plans/{planKey}**
```
planKey: string, exam, level, bucket: int, profile: string|null, pipelineVersion: 3,
shelfVersion: int, resourceIds: string[] (≤ 12, INDEXED for invalidation), resources: [shelfEntry] (≤ 12),
examProfileRef: { exam, extractedAt, reviewed }, wording: { summary, phases: { [kind]: {title, focus} } } | null,
source: 'library'|'live_discovery', cachedAt: timestamp, expireAt: timestamp (TTL = cachedAt + 30 d)
```
On a hit, the server runs `buildSchedule({days: exact, resources, …})` and overlays `wording`, which yields the CONTRACT roadmap shape.

**U/roadmaps/{id}**: the existing roadmap shape, plus:
```
planKey: string, scheduleMethod: 'deterministic_v1', calendar: string[] (≤ 180, compactCalendar),
progress: {
  done: { "d{day}t{idx}": int (epoch seconds when ticked; 0 = unknown) }   // ≤ 2000 keys
  onTrack: bool, pace: number, lastAssessedAt: int                         // hysteresis memory
}
completedTasks: { "p-t": true }   // legacy, read-only after migration
```
Per-task completion lives in **a map, not in subcollection docs**. Ticking a task is one `updateDoc(ref, {'progress.done.d12t0': ts})`.
That is a single field write with no read first, the whole plan loads in one read, and the size is bounded (a 180-day plan × ~2 tasks is about 360 keys or ~9 KB).

**U/srs/{itemId}**: exactly the `srs.js` card plus `exam`, `skill`, `front`, `back`, `source`, `createdAt`. The rules enforce the field allowlist and ranges.

**U/placement/{EXAM}**: `createSession()` state: `{v, exam, targetLevel, skills[], seed, opts{}, responses[≤20], done, stopReason, report?}`.

**stats/public**: `{resources, approvedResources, plansBuilt, cacheHitRate, learnersThisMonth, linkHealth{ok,unverified,dead}, byExam{TCF:{resources, plans}}, updatedAt}`.

### B.3 Read-optimised hot path

```
POST /api/generate-roadmap
  1. LRU(plans, planKey)        ── hit → buildSchedule (0.4 ms) → done            0 reads
  2. plans/{planKey}            ── hit → LRU.set → buildSchedule → done           1 read
  3. LRU|shelves/{EXAM}_{LEVEL} ┐ in parallel                                     1–2 reads
     LRU|exam_profiles/{EXAM}   ┘
  4. rankForPlan(shelf.entries, skillWeights) → if ≥ 3 usable: buildSchedule → planner.polish (LLM, optional)
     else Discovery → Copyright auditor → upsert resources → rebuild shelf (only this path queries `resources`)
  5. plans/{planKey}.set(...) + 1 usage-bucket write + 1 counter-shard write
```
The `resources` collection is never queried on a normal request. Only shelf rebuilds query it, and they happen after an upsert, an approve, the link cron or the nightly rollup.

### B.4 Shelf rebuild (`rebuildShelf(exam, level)`, server)

1. `resources.where('exams','array-contains',EXAM).where('approved','==',true).where('linkStatus','in',['ok','unverified','error']).limit(500)`
   uses the existing composite index, extended with `error`. Run the same query with `exams == []`, i.e. "all exams" resources, as a second query when needed.
2. `rankResources(docs, {exam, level}, {k: 40, maxPerSite: 10})`, plus `bySkill` from `rankResources(..., {skill, k: 10})` for each of the 6 skills.
3. `shelves/{key}.set({... version: FieldValue.increment(1)})`, as a single write. No transaction is needed: the last writer wins, and every writer computes
   from fresh data.

The rebuild runs in four places:
- in `upsertResource`/`saveToLibrary`, for each (exam, level) the resource is tagged with, after the request has replied;
- in `lib/routes/admin/approve.js` (served by `api/admin/[action].js`);
- in `linkMaintenance` for every `shelfKeys` entry of a resource whose status changed;
- nightly in the rollup.

That is 54 shelves (9 exams × 6 levels), each costing ≤ 500 reads only when it is rebuilt.

### B.5 Hot counters: shards and buckets

Firestore sustains about **1 write per second per document**. Today `markUsed()` writes 12 resource docs per roadmap, and the top resources are
in *every* plan, so a busy day would contend on exactly those docs. `metrics/usage` is incremented by every request and every LLM call.

- **Counters** (`cacheHits`, `roadmapsGenerated`, `fallbackPlans`, `llmTokens:<agent>` …) go to
  `counters/{name}/shards/{random 0..9}` with `{n: increment(x)}`, which gives 10× the write headroom. Reading means summing the 10 shards, which only the rollup does.
- **Per-resource usage**: there is **one** write per roadmap to `usage_buckets/{shard}_{yyyymmddhh}`, of the form
  `{u: {[rid]: increment(1)}, expireAt}`. Completions from `POST /api/events {type:'task_done', resourceId}` go to `c.{rid}`.
  The shard comes first in the id, so ids are not monotonically increasing (no index or tablet hotspot).
- **Item calibration**: `POST /api/diagnostic score` writes one doc, `calib_buckets/{shard}_{EXAM}_{LEVEL}`, with `{items: {[itemId]: {n: inc(1), err: inc(correct − p)}}}`.
  The nightly calibration job applies b ← b − K(n)·err_sum per item, the batched form of `eloUpdate`, and rewrites `item_sets/*`.
- **Rollup cron** (daily on Vercel Hobby, otherwise hourly): it sums the buckets and shards, writes `resources.usageCount/completionCount` in batches of 500,
  writes `stats/public`, rebuilds shelves, and lets TTL delete the folded buckets (`expireAt` = folded + 14 days).

Helper to add at integration time, as `lib/counters.js`:
```js
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';
const SHARDS = 10;
const shard = () => Math.floor(Math.random() * SHARDS); // randomness is fine here (load spreading, not logic)
const hourKey = (d = new Date()) => d.toISOString().slice(0, 13).replace(/[-T]/g, '');
const ttl = (days) => new Date(Date.now() + days * 864e5);
export async function bump(fields) {            // { cacheHits: 1, plannerTokens: 812 }
  const b = pub().firestore.batch();
  for (const [name, v] of Object.entries(fields)) if (v) b.set(pub().collection('counters').doc(name).collection('shards').doc(String(shard())), { n: FieldValue.increment(v) }, { merge: true });
  await b.commit();
}
export async function recordUsage(resourceIds, kind = 'u') {   // one write for any number of ids
  const data = { expireAt: ttl(14) };
  data[kind] = Object.fromEntries(resourceIds.map((id) => [id, FieldValue.increment(1)]));
  await pub().collection('usage_buckets').doc(`${shard()}_${hourKey()}`).set(data, { merge: true });
}
```

### B.6 User data

- `U/roadmaps/{id}`: one doc per saved plan, with progress as a map (B.2). The rules cap it at ≤ 2000 completion keys, a calendar of ≤ 180 entries and ≤ 30 top-level keys.
- `U/srs/{itemId}`: one doc per card, keyed by item id (idempotent "add to deck"). The review queue is
  `where('exam','==',E).where('due','<=',now).orderBy('due').limit(50)`, served by the composite index (exam, due). A review session commits **one
  batch** (≤ 500 cards). The user doc keeps `srsSummary {total, dueToday}`, recomputed on session end, for the home screen.
- `U/placement/{EXAM}`: one doc per exam. The client runs `placement.js` locally, because the items (and today's answer keys) are already
  client-side for a self-check, so a 15-item session costs **0 server calls**. The client writes the doc once at the end (and optionally after each answer for resume).
  It then calls `/api/diagnostic` with `action:'score'` so the server re-scores with `scoreFixed` (it never trusts the client's numbers) and records calibration.

### B.7 Indexes

Composite indexes, the **only** ones needed:
1. `resources (exams CONTAINS, approved ASC, linkStatus ASC)`: already exists. Used by shelf rebuilds and the legacy `findResources`.
2. `resources (approved ASC, nextCheckAt ASC)`: used by the link cron, which runs "the approved links due soonest". It replaces `orderBy('lastCheckedAt')` over everything.
3. `srs (exam ASC, due ASC)`, collection scope: the due queue.

Single-field indexes that stay automatic and are used: `plans.resourceIds` (array-contains-any invalidation), `resources.dedupKey` (dedup on
upsert), `ledger_events.createdAt` / `date` (feed order), `resources.lastCheckedAt` (legacy cron, until it is switched).

**Exemptions** (`fieldOverrides` with `indexes: []`) cover large arrays, maps with dynamic keys and long text. These save index writes,
storage and the 40k-index-entries-per-doc ceiling:
- `resources`: `title`, `url`, `license`, `pageTitle`, `auditNotes`;
- `shelves`: `entries`;
- `plans`: `roadmap`, `wording`, `expireAt`;
- `exam_profiles`: `sections`;
- `practice_sets`: `sets`, `items`, `variants`;
- `item_sets`: `items`;
- `usage_buckets`: `u`, `c`, `expireAt`;
- `calib_buckets`: `items`, `expireAt`;
- `link_checks`: `detail`, `expireAt`;
- `stats`: `byExam`;
- `roadmaps`: `phases`, `calendar`, `completedTasks`, `progress`, `verifiedResources`, `pipeline`, `summary`, `examProfile`;
- `srs`: `front`, `back`;
- `placement`: `responses`, `report`;
- `ledger_events`: `note`, `meta`.

The `progress.done` map matters most here: without the exemption, every ticked task would add an index entry.

**TTL policies** (set with `gcloud firestore fields ttls update expireAt --collection-group=<name> --enable-ttl`):
- `plans`: 30 days;
- `usage_buckets`: 14 days after folding;
- `calib_buckets`: 14 days after folding;
- `link_checks`: 90 days.

TTL deletes arrive within about 24 h of expiry. That's fine, because the server also checks `cachedAt` age itself.

### B.8 Hotspots, batching and transactions

- **Ids**: resource ids are sha1 (uniform). Plans and shelves use `{EXAM}_{LEVEL}…` (clustered, but written rarely). Ledger events use `{source}-{eventId}`
  (low volume, idempotent). Buckets put the shard first. No collection uses auto-increment or timestamp-prefixed ids.
  Timestamp fields that are only used for TTL are exempt from indexing (monotonic index hotspot).
- **Transactions** are used only where an invariant spans documents: the ledger (event create + monthly total, as today) and item calibration
  folds (read b,n → write b,n, done nightly in a single job, so there is no contention).
- **Batches** (atomic, no reads) cover: SRS review sessions, rollup writes (≤ 500 per batch), counter bumps, placement finish and calibration bucket.
- **Plain writes** cover plan cache, shelf rebuild and resource upsert. They are idempotent and last-writer-wins, because the inputs are deterministic.
- **Upserts without a read**: use `ref.create(defaults)`, and on ALREADY_EXISTS fall back to `ref.set(merge-with-arrayUnion)`. That's 1 write instead of 1 read + 1 write.

### B.9 Security rules

The proposed full file is in Appendix 1 (diff in Appendix 3). In summary:
- `P/{coll}/{doc}` is readable only for public collections, and lists must use `limit ≤ 100`. Counters, buckets, item bank and link logs are **not readable**,
  and nothing under `P` is writable by clients.
- `U`, `U/roadmaps`, `U/srs` and `U/placement` are owner-only, each with shape and size validation. The catch-all private rule excludes the three validated
  collections, so validation can't be bypassed through it.

I tested these in the Firestore emulator with `@firebase/rules-unit-testing` (scratch harness, not committed): **18/18 checks passed**. The checks covered:
- the public shelf is readable while logged out;
- the feed works with a limit and is denied without one;
- shards and buckets are denied;
- client writes to shelves are denied;
- the owner can save a roadmap with progress and calendar, and tick a task through a field path;
- a bad progress shape is rejected, and other users are denied;
- valid SRS cards pass, while extra fields and an out-of-range difficulty are rejected;
- placement id validation works, and the catch-all bypass is blocked;
- anonymous writes are denied.

⚠️ The feed rule requires a `limit`. Today's `App.jsx` listens to the **whole** `ledger_events` collection, which is also a cost
problem: every visitor reads every donation ever made. The App change in §C step 10 has to ship **before or with** the new rules.

### B.10 Cost per main action (Firestore operations)

| User action | Today (reads / writes) | v3 (reads / writes) | Notes |
|---|---|---|---|
| Open the home screen (logged out) | 2 + N reads (treasury, and **all** N ledger events) | 1 (stats/public via CDN = 0) + 1 treasury + ≤ 20 feed | the feed is bounded by `limit(20)` |
| Generate a plan, cache hit | 1 / 1–2 | **0** (LRU) or 1 / 1 | the write is one counter shard |
| Generate a plan, miss, library has enough | ~60 (query) + profile + cache = ~62 / 12 (markUsed) + 1 + 1–3 | **3** (plan miss + shelf + profile) / **3** (plan + usage bucket + shard) | plus LLM wording (optional) |
| Generate a plan, miss, library short (discovery) | as above + n×(1 read + 1 write) | + n writes (no read) + 1 shelf rebuild (≤ 500 reads, after the response) | rare, and decreasing as the library grows |
| Personalised plan (diagnostic) | never cached: ~62 / 14+ every time | same as a generic plan (keyed by profile band) | the biggest win |
| Save a plan | 0 / 1 | 0 / 1 | |
| Tick a task | 0 / 1 (rewrites the whole `completedTasks` map) | 0 / 1 field write (+1 bucket write via `/api/events`) | |
| Placement self-check (15 items) | 1 read (practice_sets) + LLM / 0–1 | 1 read (`item_sets`, CDN-cacheable) / 1 (placement doc) + 1 (calib bucket) | 0 server calls between items |
| SRS review of 20 cards | — | 20 reads (query) / 20 writes in 1 batch | |
| Coach check | 0 / 0 + LLM | 0 / 1 (`progress.onTrack`) + optional LLM wording | the numbers come from `progress.js` |
| Donation webhook | 2 / 2–3 (transaction) | unchanged | already correct |
| Link cron (150 links) | 150 / 150 + full plan-cache scan | 150 / 150 + `array-contains-any` invalidation + affected shelves | the full scan of `global_verified_roadmaps` is gone |

### B.11 Caching layers and expected latency

| Layer | What it caches | TTL / invalidation |
|---|---|---|
| CDN (`Cache-Control: public, s-maxage, stale-while-revalidate`) | `GET /api/library` (600 s), `GET /api/shelf` (600 s), `GET /api/stats` (300 s), `GET /api/plan?exam&level&days&profile` (3600 s), `GET /api/item-set` (3600 s), `GET /api/check-link` (86400 s, as today) | the TTL; the shelf `version` goes in the response's ETag |
| In-memory LRU per warm function instance (`lru.js`) | shelves (10 min), exam profiles (1 h), plans (10 min) | the TTL; `wrap()` single-flight stops a cold-start stampede |
| Firestore shelf/plan docs | precomputed rankings and plan skeletons | rebuilt on write and by the cron; plans also by TTL and dead-link invalidation |

The client should call `GET /api/plan` first, which the CDN can cache. Only on a 404 should it `POST /api/generate-roadmap`, so popular plans never touch a function.

Expected server-side latency, assuming the Vercel region is co-located with the Firestore location (e.g. `eur3` with `fra1`/`cdg1`).
These are estimates, not measured against real Firestore:
- CDN hit: ~20–60 ms TTFB.
- LRU hit plus `buildSchedule`: about 1–3 ms of compute.
- One Firestore doc read: ~10–30 ms, with an uncached plan (3 reads in parallel) at ~30–60 ms before the LLM step.
- The planner LLM call (1–10 s on free models) dominates misses, which is why the wording is cached per bucket and profile and the deterministic schedule is returned if the LLM is slow.
- A cold start (firebase-admin init) adds ~0.3–1 s.

### B.12 Migration plan (from today's layout)

Each step can be deployed and rolled back on its own. Gate the new code paths behind `ALGO_V3=1`.

0. **Ship `lib/algo/*`** (done). This is pure code with no behaviour change.
1. **Indexes and TTL**: deploy the proposed `firestore.indexes.json` (`firebase deploy --only firestore:indexes`) and enable TTL on the four collections.
   This is additive and harmless.
2. **Backfill resources** with `scripts/migrate-v3.mjs` (to write; it's idempotent):
   - for every resource, compute `canonicalUrl`, `resourceIdFor`, `site`, `dedupKey`, `tier`, `shelfKeys`, `completionCount: 0`, and `nextCheckAt = lastCheckedAt + 14 d`;
   - if the new id ≠ the old id (only URLs with unsorted or extra query params), copy to the new id and set `duplicateOf` and `approved:false` on the old one;
   - run `findNearDuplicates`, keep the best-ranked member of each cluster, and mark the rest `duplicateOf`/`approved:false`, with a dry-run report first.
3. **Build all shelves** (54 docs) and `stats/public`.
4. **Switch reads** (§C steps 1–7):
   - the orchestrator uses `plans/{planKey}` and shelves;
   - dual-read: on a `plans` miss, try `global_verified_roadmaps/{EXAM-LEVEL-DAYS}` for 30 days, and write through to `plans`.
5. **Switch writes**: counters and buckets replace `markUsed` and `metrics/usage` increments. Ship the rollup cron at the same time.
6. **Client**:
   - ship the App change first (the bounded ledger feed, `progress.done` map writes, `GET /api/plan`, and SRS/placement using the pure modules), then the new rules;
   - existing roadmaps are upgraded lazily on open: `completedTasks{"p-t":true}` becomes `progress.done{"d{day}t0": 0}` via the phase's day range. The legacy map is kept read-only.
7. **Clean up after 30 days**:
   - delete `global_verified_roadmaps/*` and the `metrics/usage` legacy fields;
   - remove the legacy collections from `publicReadable()`;
   - drop index #1's `linkStatus` if shelf rebuilds filter in memory.

Rollback: unset `ALGO_V3`. The old collections are still being written until step 7.

---

## C. Integration checklist (exact changes, in order)

> Apply after the end-to-end worker finishes. File paths are relative to the repo root.

1. **`lib/library.js`**
   - `findResources({exam, level, limit})`: raise the query `.limit(60)` → `.limit(200)` and add `'error'` to the `linkStatus in` list. Replace the `.filter(...).sort(...)` chain with
     `rankResources(docs, {exam, level}, {k: limit})` from `./algo/rank.js`, and keep the `fresh` flag mapping. The signature is unchanged.
   - Add `export async function getShelf(exam, level)`. It reads `pub().collection('shelves').doc(shelfKey(exam, level))` through a module-level `createLru({max: 200, ttlMs: 600000})`.
     If there is no doc, it calls `rebuildShelf(exam, level)`, which follows §B.4 and lives in this file.
   - `upsertResource(r, …)`:
     - compute `url = canonicalUrl(r.url)` (from `./algo/keys.js`) and add `site`, `dedupKey`, `tier: tierScore(url, r.exams?.[0])`, `nextCheckAt`, `checkIntervalDays`;
     - before creating, query `resources.where('dedupKey','==',dedupKey(url)).limit(1)` and merge into the hit if there is one;
     - replace the `get()`-then-`set()` with `create()`, falling back to merge on ALREADY_EXISTS;
     - fix the empty `arrayUnion()` call (only add `skills/exams/levels` unions when non-empty, already partly done), which makes `orchestrator.saveToLibrary`'s retry unnecessary.
   - `resourceId(url)`: switch to `resourceIdFor` **only after** migration step 2.
   - `markUsed(ids)`: change the body to `recordUsage(ids)` from the new `lib/counters.js` (§B.5).
2. **`lib/orchestrator.js` → `generateRoadmap(body)`**
   - ``const key = `${exam}-${level}-${days}` `` becomes `const key = planKey({exam, level, days, skillScores})` (keys.js).
   - Remove the "personalised plans are not cached" branch, so personalised plans are cached by profile band. Keep `forceRefresh`.
   - `cacheDoc` becomes `pub().collection('plans').doc(key)`, with the dual-read fallback to `global_verified_roadmaps/${exam}-${level}-${days}` (migration step 4).
     On a hit, return `assembleFromPlan(planDoc, {days, skillScores})`, a new local function: `buildSchedule({exam, level, days, skillScores, examProfile, resources: planDoc.resources})`,
     then overlay `planDoc.wording`, then the CONTRACT shape.
   - Steps 2 and 4: run `getProfile(exam)` and `getShelf(exam, level)` together with `Promise.all`. Then
     `resources = rankForPlan(shelf.entries, {exam, level, skillWeights: skillNeeds(sectionWeightsFromProfile(examProfile), skillScores)}, {k: MAX_RESOURCES})`.
     Keep `refreshStale()` but only for entries with `components.health < 0.6`. Discovery is unchanged; after `saveToLibrary`, call `rebuildShelf` without awaiting it.
   - Step 5: `const sched = buildSchedule({exam, level, days, skillScores, examProfile, resources})`. Call `polishPlan({..., skeleton: sched})` (step 3). On
     `!ok`, use `sched` as-is (`pipeline: planner skipped/failed → "deterministic schedule"`). Delete the `buildFallbackPlan` call.
   - Assemble: add `planKey: key`, `scheduleMethod: sched.method`, `calendar: compactCalendar(sched.calendar, resources)`, `allocation: sched.allocation`.
   - Cache write: `plans/{key}.set({planKey, exam, level, bucket: bucketDays(days), profile: quantiseProfile(skillScores), pipelineVersion: 3, shelfVersion, resourceIds, resources: resources.map(shelfEntry), wording, source, cachedAt, expireAt})`.
   - `bumpMetrics(fields)` becomes `bump(fields)` from `lib/counters.js`.
3. **`lib/agents/planner.js`**
   - Add `export async function polishPlan({exam, level, days, skeleton, resources, examProfile})`. The LLM receives `skeleton.phases` (titles, focus, tasks) and returns
     the same number of phases and tasks, rewriting only `summary`, `phaseTitle` (without the day prefix), `focus` and task wording.
   - The validator enforces that the phase and task counts are identical, there are no URLs (`hasUrl`), and every quoted “title” present in the skeleton task is still present.
   - Then `repairPlan` keeps the skeleton's ranges, which are already valid.
   - Return `{ok, plan, wording: {summary, phases: {[kind]: {title, focus}}}, usage}`.
   - Keep `planRoadmap` for one release, then delete it. Make `buildFallbackPlan` a thin wrapper around `buildSchedule` (tests still import it).
4. **`lib/agents/diagnostic.js`**
   - `createDiagnostic`: attach `b: THETA[q.cefr]`, or the calibrated `b` from `item_sets/{EXAM}_{LEVEL}` when present, to each question. Add `mode: 'fixed'` now and `'adaptive'` once item sets exist.
   - `scoreDiagnostic`: when every answer has `cefr`, compute `const irt = scoreFixed({targetLevel: level, answers})` (placement.js). Return the existing fields with
     `skillScores = irt.skillScores` and `estimatedLevel = irt.estimatedLevel`, plus `confidence`, `theta` and `se`, and `method: 'irt_eap'`.
     Keep the current band logic as the `else` branch. Keep the advice strings (thresholds 0.5/0.75 are still valid on the 0..1 scale).
   - After scoring, write one `calib_buckets/{shard}_{EXAM}_{LEVEL}` doc (§B.5). This is best-effort.
5. **`lib/agents/coach.js`**
   - `computeProgress(rm, daysElapsed)`: when the roadmap has `progress.done` with timestamps, call
     `assessProgress({days: rm.days, startDate: rm.createdAt, totalTasks, completedAt: Object.values(rm.progress.done).filter(Boolean).map((s) => s * 1000), calendar: expandCalendar(rm.calendar, rm.verifiedResources), previous: rm.progress})`.
   - Map it to `{expected, actual, onTrack, remainingDays}` and keep the legacy path for old roadmaps.
   - Add `pace`, `projectedFinishDate`, `requiredPace` and `readiness` to the response and to the LLM prompt (the LLM explains them).
   - Update `parseRoadmap` to accept the `progress`/`calendar` fields.
6. **`lib/agents/linkMaintenance.js`**
   - `recheckLinks`: the query becomes `resources.where('approved','==',true).orderBy('nextCheckAt','asc').limit(batchSize)` (index #2).
     Until the backfill is done, fall back to the current `orderBy('lastCheckedAt')`.
   - `nextLinkState`: merge in `nextLinkCheckAt({id, status, prevIntervalDays: resource.checkIntervalDays, now})`.
   - After the batch, rebuild shelves for the union of `shelfKeys` of resources whose `linkStatus` or `approved` changed.
   - `invalidateRoadmaps`: replace the full `select().get()` scan with chunks of 30 ids:
     `plans.where('resourceIds','array-contains-any', chunk).select().get()`, then delete. Keep the legacy scan on `global_verified_roadmaps` during migration.
   - Write `link_checks/{rid}_{yyyymmdd}` with `expireAt` (+90 d) only for status changes.
7. **`lib/routes/library.js`** (served at `/api/library` by `api/[route].js`): serve from `getShelf(exam, level)` (entries, or `bySkill[skill]` mapped back through the entries), and set
   `Cache-Control: public, s-maxage=600, stale-while-revalidate=86400`. It falls back to the current query when a shelf is missing.
8. **New files**:
   - `lib/counters.js` (§B.5);
   - **Function budget (Vercel Hobby: max 12 Serverless Functions per deployment; every file under `api/` counts, `lib/` does not).**
     Do **not** add new files under `api/`. Write each handler in `lib/routes/…` and register it in the matching dispatcher table;
     the public URL stays `/api/<name>`:
     - `lib/routes/plan.js` → `ROUTES.plan` in `api/[route].js` (GET, CDN-cached plan lookup by `planKey`, 404 on miss);
     - `lib/routes/stats.js` → `ROUTES.stats` in `api/[route].js` (GET `stats/public`, s-maxage=300);
     - `lib/routes/events.js` → `ROUTES.events` in `api/[route].js` (POST `{type:'task_done', resourceId}` → `recordUsage([id], 'c')`, which validates that the id exists on the caller's plan and rate-limits by IP);
     - `lib/routes/shelf.js` / `lib/routes/item-set.js` → `api/[route].js` too, if they ship;
     - `lib/routes/cron/rollup.js` → `ROUTES.rollup` in `api/cron/[job].js` (Bearer `CRON_SECRET`: fold buckets and shards → `resources`, `stats/public`, shelves; fold `calib_buckets` → `item_bank` and `item_sets`). It inherits `maxDuration: 300` from the `api/cron/*.js` glob;
     - new admin actions → `api/admin/[action].js`; new donation providers → `api/webhooks/[provider].js` (handlers must read the raw body via `lib/http.js` `rawBody()` and never touch `req.body` before verifying).
     Current entrypoints (8): `generate-roadmap`, `diagnostic`, `coach`, `practice` (LLM routes, kept separate so their cold starts and limits stay isolated),
     plus the dispatchers `[route]`, `admin/[action]`, `webhooks/[provider]`, `cron/[job]`. A new standalone file is only justified for a route that needs its own
     `maxDuration`/memory or isolation; check `find api -name '*.js' ! -name '_*' | wc -l` stays ≤ 10 so there is headroom. Static files win over `[param].js` in the same folder,
     and files or folders starting with `_` are not functions (but keep helpers in `lib/` anyway). Every dispatcher answers unknown names with a JSON 404,
     and `scripts/local-server.mjs` routes `[param].js` the same way as Vercel, so add an e2e case for each new name.
   - `scripts/migrate-v3.mjs` (§B.12 step 2–3, with `--dry-run`).
   - `vercel.json`: add `{"path": "/api/cron/rollup", "schedule": "30 3 * * *"}`.
9. **`firestore.indexes.json` and `firestore.rules`** (repo root): replace them with Appendix 2 and Appendix 1 respectively. Deploy the indexes at migration step 1,
   and the rules **after** the App change in step 10.
10. **`App.jsx`** (repo root):
    - The ledger feed `onSnapshot(eventsColRef)` becomes `onSnapshot(query(eventsColRef, orderBy('createdAt','desc'), limit(20)))`.
    - Ticking a task becomes `updateDoc(roadmapRef, {['progress.done.' + key]: Math.floor(Date.now()/1000)})`.
    - Fetch `GET /api/plan` before `POST /api/generate-roadmap`.
    - Placement: bundle `lib/algo/placement.js` and run `nextItem`/`recordAnswer` locally over `item_sets`.
    - SRS: bundle `lib/algo/srs.js`; `U/srs` cards and the review queue query.
    - Progress ring and readiness come from `progress.js` (pure, browser-safe).
11. **`CONTRACT.md`**: document the new collections, `planKey`, the `progress`/`calendar` fields, `GET /api/plan`, `/api/stats` and `/api/events`, and that `onTrack` and the schedule are deterministic.
12. **Tests**: keep `node scripts/test-algo.mjs` in CI next to the three existing suites. Add orchestrator tests for the plan-cache hit with
    exact-days rescheduling and for the personalised cache key, plus a rules test suite based on the emulator harness in §B.9.

---

## Appendix 1: proposed `firestore.rules` (full file)

```
rules_version = '2';
// OpenExam Hub — PROPOSED rules for the v3 data model (see ARCHITECTURE.md §B.9).
// Clients only ever write their own data under artifacts/{appId}/users/{uid}/...; everything
// public is server-written (firebase-admin bypasses rules). Default deny.
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }
    function levels() { return ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']; }
    function skills() { return ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary']; }
    function isNum(x) { return x is int || x is float; }
    function isTime(x) { return x is int || x is timestamp; }
    function optStr(d, k, max) { return !(k in d) || (d[k] is string && d[k].size() <= max); }

    // ---------------------------------------------------------------- public (read-only)
    // Readable collections under public/data. Server-only collections (counters, usage_buckets,
    // calib_buckets, item_bank, link_checks) are deliberately absent -> denied to clients.
    function publicReadable(coll) {
      return coll in ['resources', 'shelves', 'plans', 'exam_profiles', 'practice_sets', 'item_sets',
                      'ledger_events', 'treasury', 'stats',
                      // legacy, readable until the migration's cleanup step (§B.12 step 7):
                      'global_verified_roadmaps', 'metrics'];
    }
    match /artifacts/{appId}/public/data/{coll}/{docId} {
      allow get: if publicReadable(coll);
      // Listing is limited to the small feeds the app pages through.
      allow list: if publicReadable(coll) && request.query.limit <= 100;
      allow write: if false;
    }
    match /artifacts/{appId}/public/data/{coll}/{docId}/{rest=**} {
      allow read, write: if false;
    }

    // ---------------------------------------------------------------- user profile doc
    match /artifacts/{appId}/users/{uid} {
      allow read, delete: if isOwner(uid);
      allow create, update: if isOwner(uid)
        && request.resource.data.keys().size() <= 20
        && optStr(request.resource.data, 'displayName', 80)
        && (!('placementSummary' in request.resource.data) || request.resource.data.placementSummary is map)
        && (!('prefs' in request.resource.data) || (request.resource.data.prefs is map && request.resource.data.prefs.size() <= 20));
    }

    // ---------------------------------------------------------------- roadmaps (+ progress map)
    function validProgress(p) {
      return p is map
        && p.keys().hasOnly(['done', 'onTrack', 'lastAssessedAt', 'pace'])
        && (!('done' in p) || (p.done is map && p.done.size() <= 2000))
        && (!('onTrack' in p) || p.onTrack is bool)
        && (!('pace' in p) || isNum(p.pace))
        && (!('lastAssessedAt' in p) || isTime(p.lastAssessedAt));
    }
    function validRoadmap(roadmapId) {
      let d = request.resource.data;
      return d.keys().hasAll(['exam', 'level', 'days', 'phases'])
        && d.keys().size() <= 30
        && (!('id' in d) || d.id == roadmapId)
        && d.exam is string && d.exam.size() >= 2 && d.exam.size() <= 24
        && d.level in levels()
        && d.days is int && d.days >= 1 && d.days <= 180
        && d.phases is list && d.phases.size() <= 60
        && optStr(d, 'summary', 5000)
        && optStr(d, 'planKey', 64)
        && optStr(d, 'scheduleMethod', 32)
        && (!('completedTasks' in d) || (d.completedTasks is map && d.completedTasks.size() <= 2000))
        && (!('progress' in d) || validProgress(d.progress))
        && (!('calendar' in d) || (d.calendar is list && d.calendar.size() <= 180))
        && (!('verifiedResources' in d) || (d.verifiedResources is list && d.verifiedResources.size() <= 60))
        && (!('pipeline' in d) || (d.pipeline is list && d.pipeline.size() <= 40))
        && (!('createdAt' in d) || d.createdAt is string || d.createdAt is timestamp);
    }
    match /artifacts/{appId}/users/{uid}/roadmaps/{roadmapId} {
      allow read, delete: if isOwner(uid);
      allow create, update: if isOwner(uid) && validRoadmap(roadmapId);
    }

    // ---------------------------------------------------------------- SRS cards (one doc per item)
    function validCard(itemId) {
      let c = request.resource.data;
      return itemId.size() <= 80
        && c.keys().hasOnly(['id', 'exam', 'skill', 'front', 'back', 'state', 'due', 'stability', 'difficulty',
                             'reps', 'lapses', 'lastReview', 'interval', 'retrievability', 'source', 'createdAt'])
        && c.keys().hasAll(['state', 'due'])
        && (!('id' in c) || c.id == itemId)
        && c.state in ['new', 'learning', 'review', 'relearning']
        && isTime(c.due)
        && (!('stability' in c) || (isNum(c.stability) && c.stability >= 0 && c.stability <= 36500))
        && (!('difficulty' in c) || (isNum(c.difficulty) && c.difficulty >= 0 && c.difficulty <= 10))
        && (!('reps' in c) || (c.reps is int && c.reps >= 0))
        && (!('lapses' in c) || (c.lapses is int && c.lapses >= 0))
        && (!('skill' in c) || c.skill in skills())
        && optStr(c, 'exam', 24) && optStr(c, 'front', 1000) && optStr(c, 'back', 2000) && optStr(c, 'source', 40);
    }
    match /artifacts/{appId}/users/{uid}/srs/{itemId} {
      allow read, delete: if isOwner(uid);
      allow create, update: if isOwner(uid) && validCard(itemId);
    }

    // ---------------------------------------------------------------- placement sessions (one per exam)
    function validPlacement(exam) {
      let s = request.resource.data;
      return exam.matches('^[A-Z][A-Z0-9_-]{1,19}$')
        && s.keys().size() <= 16
        && s.targetLevel in levels()
        && s.responses is list && s.responses.size() <= 20
        && (!('done' in s) || s.done is bool)
        && (!('report' in s) || s.report is map);
    }
    match /artifacts/{appId}/users/{uid}/placement/{exam} {
      allow read, delete: if isOwner(uid);
      allow create, update: if isOwner(uid) && validPlacement(exam);
    }

    // ---------------------------------------------------------------- other private sub-collections
    // Owner only. Listed collections have their own validated rule above and are excluded here,
    // because Firestore allows access if ANY matching rule allows it.
    match /artifacts/{appId}/users/{uid}/{coll}/{rest=**} {
      allow read: if isOwner(uid);
      allow write: if isOwner(uid) && !(coll in ['roadmaps', 'srs', 'placement']);
    }
  }
}
```

## Appendix 2: proposed `firestore.indexes.json` (full file)

```json
{
  "indexes": [
    {
      "collectionGroup": "resources",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "exams", "arrayConfig": "CONTAINS" },
        { "fieldPath": "approved", "order": "ASCENDING" },
        { "fieldPath": "linkStatus", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "resources",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "approved", "order": "ASCENDING" },
        { "fieldPath": "nextCheckAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "srs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "exam", "order": "ASCENDING" },
        { "fieldPath": "due", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": [
    { "collectionGroup": "resources", "fieldPath": "title", "indexes": [] },
    { "collectionGroup": "resources", "fieldPath": "url", "indexes": [] },
    { "collectionGroup": "resources", "fieldPath": "license", "indexes": [] },
    { "collectionGroup": "resources", "fieldPath": "pageTitle", "indexes": [] },
    { "collectionGroup": "resources", "fieldPath": "auditNotes", "indexes": [] },
    { "collectionGroup": "shelves", "fieldPath": "entries", "indexes": [] },
    { "collectionGroup": "plans", "fieldPath": "roadmap", "indexes": [] },
    { "collectionGroup": "plans", "fieldPath": "wording", "indexes": [] },
    { "collectionGroup": "plans", "fieldPath": "expireAt", "indexes": [] },
    { "collectionGroup": "global_verified_roadmaps", "fieldPath": "roadmap", "indexes": [] },
    { "collectionGroup": "exam_profiles", "fieldPath": "sections", "indexes": [] },
    { "collectionGroup": "practice_sets", "fieldPath": "sets", "indexes": [] },
    { "collectionGroup": "practice_sets", "fieldPath": "items", "indexes": [] },
    { "collectionGroup": "practice_sets", "fieldPath": "variants", "indexes": [] },
    { "collectionGroup": "item_sets", "fieldPath": "items", "indexes": [] },
    { "collectionGroup": "item_bank", "fieldPath": "prompt", "indexes": [] },
    { "collectionGroup": "usage_buckets", "fieldPath": "u", "indexes": [] },
    { "collectionGroup": "usage_buckets", "fieldPath": "c", "indexes": [] },
    { "collectionGroup": "usage_buckets", "fieldPath": "expireAt", "indexes": [] },
    { "collectionGroup": "calib_buckets", "fieldPath": "items", "indexes": [] },
    { "collectionGroup": "calib_buckets", "fieldPath": "expireAt", "indexes": [] },
    { "collectionGroup": "link_checks", "fieldPath": "detail", "indexes": [] },
    { "collectionGroup": "link_checks", "fieldPath": "expireAt", "indexes": [] },
    { "collectionGroup": "stats", "fieldPath": "byExam", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "phases", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "calendar", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "completedTasks", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "progress", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "verifiedResources", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "pipeline", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "summary", "indexes": [] },
    { "collectionGroup": "roadmaps", "fieldPath": "examProfile", "indexes": [] },
    { "collectionGroup": "srs", "fieldPath": "front", "indexes": [] },
    { "collectionGroup": "srs", "fieldPath": "back", "indexes": [] },
    { "collectionGroup": "placement", "fieldPath": "responses", "indexes": [] },
    { "collectionGroup": "placement", "fieldPath": "report", "indexes": [] },
    { "collectionGroup": "ledger_events", "fieldPath": "note", "indexes": [] },
    { "collectionGroup": "ledger_events", "fieldPath": "meta", "indexes": [] }
  ]
}
```

## Appendix 3: unified diffs against the current files

<details><summary>firestore.indexes.json</summary>

```diff
--- current/firestore.indexes.json	2026-11-20 13:09:55.472365298 +0200
+++ firestore.indexes.json	2026-11-20 13:15:11.998506640 +0200
@@ -13,10 +13,57 @@
       "collectionGroup": "resources",
       "queryScope": "COLLECTION",
       "fields": [
-        { "fieldPath": "exams", "arrayConfig": "CONTAINS" },
-        { "fieldPath": "approved", "order": "ASCENDING" }
+        { "fieldPath": "approved", "order": "ASCENDING" },
+        { "fieldPath": "nextCheckAt", "order": "ASCENDING" }
+      ]
+    },
+    {
+      "collectionGroup": "srs",
+      "queryScope": "COLLECTION",
+      "fields": [
+        { "fieldPath": "exam", "order": "ASCENDING" },
+        { "fieldPath": "due", "order": "ASCENDING" }
       ]
     }
   ],
-  "fieldOverrides": []
+  "fieldOverrides": [
+    { "collectionGroup": "resources", "fieldPath": "title", "indexes": [] },
+    { "collectionGroup": "resources", "fieldPath": "url", "indexes": [] },
+    { "collectionGroup": "resources", "fieldPath": "license", "indexes": [] },
+    { "collectionGroup": "resources", "fieldPath": "pageTitle", "indexes": [] },
+    { "collectionGroup": "resources", "fieldPath": "auditNotes", "indexes": [] },
+    { "collectionGroup": "shelves", "fieldPath": "entries", "indexes": [] },
+    { "collectionGroup": "plans", "fieldPath": "roadmap", "indexes": [] },
+    { "collectionGroup": "plans", "fieldPath": "wording", "indexes": [] },
+    { "collectionGroup": "plans", "fieldPath": "expireAt", "indexes": [] },
+    { "collectionGroup": "global_verified_roadmaps", "fieldPath": "roadmap", "indexes": [] },
+    { "collectionGroup": "exam_profiles", "fieldPath": "sections", "indexes": [] },
+    { "collectionGroup": "practice_sets", "fieldPath": "sets", "indexes": [] },
+    { "collectionGroup": "practice_sets", "fieldPath": "items", "indexes": [] },
+    { "collectionGroup": "practice_sets", "fieldPath": "variants", "indexes": [] },
+    { "collectionGroup": "item_sets", "fieldPath": "items", "indexes": [] },
+    { "collectionGroup": "item_bank", "fieldPath": "prompt", "indexes": [] },
+    { "collectionGroup": "usage_buckets", "fieldPath": "u", "indexes": [] },
+    { "collectionGroup": "usage_buckets", "fieldPath": "c", "indexes": [] },
+    { "collectionGroup": "usage_buckets", "fieldPath": "expireAt", "indexes": [] },
+    { "collectionGroup": "calib_buckets", "fieldPath": "items", "indexes": [] },
+    { "collectionGroup": "calib_buckets", "fieldPath": "expireAt", "indexes": [] },
+    { "collectionGroup": "link_checks", "fieldPath": "detail", "indexes": [] },
+    { "collectionGroup": "link_checks", "fieldPath": "expireAt", "indexes": [] },
+    { "collectionGroup": "stats", "fieldPath": "byExam", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "phases", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "calendar", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "completedTasks", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "progress", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "verifiedResources", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "pipeline", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "summary", "indexes": [] },
+    { "collectionGroup": "roadmaps", "fieldPath": "examProfile", "indexes": [] },
+    { "collectionGroup": "srs", "fieldPath": "front", "indexes": [] },
+    { "collectionGroup": "srs", "fieldPath": "back", "indexes": [] },
+    { "collectionGroup": "placement", "fieldPath": "responses", "indexes": [] },
+    { "collectionGroup": "placement", "fieldPath": "report", "indexes": [] },
+    { "collectionGroup": "ledger_events", "fieldPath": "note", "indexes": [] },
+    { "collectionGroup": "ledger_events", "fieldPath": "meta", "indexes": [] }
+  ]
 }
```
</details>

<details><summary>firestore.rules</summary>

```diff
--- current/firestore.rules	2026-11-20 13:09:39.520862130 +0200
+++ firestore.rules	2026-11-20 13:14:38.303556117 +0200
@@ -1,72 +1,122 @@
 rules_version = '2';
-
-// OpenExam Hub — Firestore security rules.
-// The browser is a READER of everything shared and a WRITER only of its own user data.
-// Every shared document (resource library, roadmap cache, donation ledger, metrics, exam
-// profiles, practice sets) is written exclusively by the server with the Admin SDK, which
-// bypasses these rules. That is what stops anyone from inflating the donation total to switch
-// the ads off, poisoning the shared roadmap cache, or approving their own links.
+// OpenExam Hub — PROPOSED rules for the v3 data model (see ARCHITECTURE.md §B.9).
+// Clients only ever write their own data under artifacts/{appId}/users/{uid}/...; everything
+// public is server-written (firebase-admin bypasses rules). Default deny.
 service cloud.firestore {
   match /databases/{database}/documents {
-
-    function signedIn() {
-      return request.auth != null;
+    function signedIn() { return request.auth != null; }
+    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }
+    function levels() { return ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']; }
+    function skills() { return ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary']; }
+    function isNum(x) { return x is int || x is float; }
+    function isTime(x) { return x is int || x is timestamp; }
+    function optStr(d, k, max) { return !(k in d) || (d[k] is string && d[k].size() <= max); }
+
+    // ---------------------------------------------------------------- public (read-only)
+    // Readable collections under public/data. Server-only collections (counters, usage_buckets,
+    // calib_buckets, item_bank, link_checks) are deliberately absent -> denied to clients.
+    function publicReadable(coll) {
+      return coll in ['resources', 'shelves', 'plans', 'exam_profiles', 'practice_sets', 'item_sets',
+                      'ledger_events', 'treasury', 'stats',
+                      // legacy, readable until the migration's cleanup step (§B.12 step 7):
+                      'global_verified_roadmaps', 'metrics'];
+    }
+    match /artifacts/{appId}/public/data/{coll}/{docId} {
+      allow get: if publicReadable(coll);
+      // Listing is limited to the small feeds the app pages through.
+      allow list: if publicReadable(coll) && request.query.limit <= 100;
+      allow write: if false;
     }
-    function isOwner(uid) {
-      return signedIn() && request.auth.uid == uid;
+    match /artifacts/{appId}/public/data/{coll}/{docId}/{rest=**} {
+      allow read, write: if false;
     }
 
-    // Shape + size check for a saved personal roadmap (Firestore rules cannot measure bytes,
-    // so list/string lengths and key counts are bounded instead; the hard 1 MiB doc cap still applies).
+    // ---------------------------------------------------------------- user profile doc
+    match /artifacts/{appId}/users/{uid} {
+      allow read, delete: if isOwner(uid);
+      allow create, update: if isOwner(uid)
+        && request.resource.data.keys().size() <= 20
+        && optStr(request.resource.data, 'displayName', 80)
+        && (!('placementSummary' in request.resource.data) || request.resource.data.placementSummary is map)
+        && (!('prefs' in request.resource.data) || (request.resource.data.prefs is map && request.resource.data.prefs.size() <= 20));
+    }
+
+    // ---------------------------------------------------------------- roadmaps (+ progress map)
+    function validProgress(p) {
+      return p is map
+        && p.keys().hasOnly(['done', 'onTrack', 'lastAssessedAt', 'pace'])
+        && (!('done' in p) || (p.done is map && p.done.size() <= 2000))
+        && (!('onTrack' in p) || p.onTrack is bool)
+        && (!('pace' in p) || isNum(p.pace))
+        && (!('lastAssessedAt' in p) || isTime(p.lastAssessedAt));
+    }
     function validRoadmap(roadmapId) {
       let d = request.resource.data;
       return d.keys().hasAll(['exam', 'level', 'days', 'phases'])
-        // Bounded key count rather than hasOnly(): the server roadmap object may gain fields,
-        // and a strict allowlist would silently break saving.
-        && d.keys().size() <= 25
+        && d.keys().size() <= 30
         && (!('id' in d) || d.id == roadmapId)
         && d.exam is string && d.exam.size() >= 2 && d.exam.size() <= 24
-        && d.level in ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
+        && d.level in levels()
         && d.days is int && d.days >= 1 && d.days <= 180
         && d.phases is list && d.phases.size() <= 60
-        && (!('summary' in d) || (d.summary is string && d.summary.size() <= 5000))
+        && optStr(d, 'summary', 5000)
+        && optStr(d, 'planKey', 64)
+        && optStr(d, 'scheduleMethod', 32)
         && (!('completedTasks' in d) || (d.completedTasks is map && d.completedTasks.size() <= 2000))
+        && (!('progress' in d) || validProgress(d.progress))
+        && (!('calendar' in d) || (d.calendar is list && d.calendar.size() <= 180))
         && (!('verifiedResources' in d) || (d.verifiedResources is list && d.verifiedResources.size() <= 60))
         && (!('pipeline' in d) || (d.pipeline is list && d.pipeline.size() <= 40))
         && (!('createdAt' in d) || d.createdAt is string || d.createdAt is timestamp);
     }
-
-    // 1) Shared/public data: readable by anyone (signed in or not, the app works logged out);
-    //    never writable from a client. Covers resources, exam_profiles, global_verified_roadmaps,
-    //    practice_sets, treasury/*, ledger_events/*, metrics/*.
-    match /artifacts/{appId}/public/{document=**} {
-      allow read: if true;
-      allow write: if false;
+    match /artifacts/{appId}/users/{uid}/roadmaps/{roadmapId} {
+      allow read, delete: if isOwner(uid);
+      allow create, update: if isOwner(uid) && validRoadmap(roadmapId);
     }
 
-    // 2) The user's own profile doc (artifacts/{appId}/users/{uid}).
-    match /artifacts/{appId}/users/{uid} {
-      allow read, write: if isOwner(uid);
+    // ---------------------------------------------------------------- SRS cards (one doc per item)
+    function validCard(itemId) {
+      let c = request.resource.data;
+      return itemId.size() <= 80
+        && c.keys().hasOnly(['id', 'exam', 'skill', 'front', 'back', 'state', 'due', 'stability', 'difficulty',
+                             'reps', 'lapses', 'lastReview', 'interval', 'retrievability', 'source', 'createdAt'])
+        && c.keys().hasAll(['state', 'due'])
+        && (!('id' in c) || c.id == itemId)
+        && c.state in ['new', 'learning', 'review', 'relearning']
+        && isTime(c.due)
+        && (!('stability' in c) || (isNum(c.stability) && c.stability >= 0 && c.stability <= 36500))
+        && (!('difficulty' in c) || (isNum(c.difficulty) && c.difficulty >= 0 && c.difficulty <= 10))
+        && (!('reps' in c) || (c.reps is int && c.reps >= 0))
+        && (!('lapses' in c) || (c.lapses is int && c.lapses >= 0))
+        && (!('skill' in c) || c.skill in skills())
+        && optStr(c, 'exam', 24) && optStr(c, 'front', 1000) && optStr(c, 'back', 2000) && optStr(c, 'source', 40);
+    }
+    match /artifacts/{appId}/users/{uid}/srs/{itemId} {
+      allow read, delete: if isOwner(uid);
+      allow create, update: if isOwner(uid) && validCard(itemId);
     }
 
-    // 3) Saved roadmaps: owner only; creates/updates must pass the shape check
-    //    (ticking a task rewrites completedTasks, which is re-validated too).
-    match /artifacts/{appId}/users/{uid}/roadmaps/{roadmapId} {
+    // ---------------------------------------------------------------- placement sessions (one per exam)
+    function validPlacement(exam) {
+      let s = request.resource.data;
+      return exam.matches('^[A-Z][A-Z0-9_-]{1,19}$')
+        && s.keys().size() <= 16
+        && s.targetLevel in levels()
+        && s.responses is list && s.responses.size() <= 20
+        && (!('done' in s) || s.done is bool)
+        && (!('report' in s) || s.report is map);
+    }
+    match /artifacts/{appId}/users/{uid}/placement/{exam} {
       allow read, delete: if isOwner(uid);
-      allow create, update: if isOwner(uid) && validRoadmap(roadmapId);
+      allow create, update: if isOwner(uid) && validPlacement(exam);
     }
 
-    // 4) Any other private sub-collection under the user (settings, diagnostic results, ...):
-    //    owner only. `coll != 'roadmaps'` keeps rule 3's validation from being bypassed,
-    //    because Firestore grants access if ANY matching rule allows it.
+    // ---------------------------------------------------------------- other private sub-collections
+    // Owner only. Listed collections have their own validated rule above and are excluded here,
+    // because Firestore allows access if ANY matching rule allows it.
     match /artifacts/{appId}/users/{uid}/{coll}/{rest=**} {
       allow read: if isOwner(uid);
-      allow write: if isOwner(uid) && coll != 'roadmaps';
+      allow write: if isOwner(uid) && !(coll in ['roadmaps', 'srs', 'placement']);
     }
-
-    // Note: docs nested below a roadmap (roadmaps/{id}/x/y) match rule 4 with coll == 'roadmaps',
-    // so the owner can read them but nobody can write them.
-
-    // 5) Everything else is denied by default (no rule matches -> no access).
   }
 }
```
</details>
