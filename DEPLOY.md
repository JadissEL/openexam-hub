# OpenExam Hub: deployment guide

One Vercel project serves both halves: the static Vite build (`dist/`) and the Node 24 serverless
functions in `api/**`. The functions that use Firestore
through `firebase-admin`. All AI calls go through one OpenAI-compatible endpoint (`lib/llm.js`).
The default is a self-hosted **OmniRoute** gateway on a small always-on host.

```
Browser (src/App.jsx) ──reads──▶ Firestore (public/**, read-only for clients)
      │                         ▲
      └──POST /api/*──▶ Vercel functions ──Admin SDK writes──┘
                              │
                              └──▶ https://llm.example.org/v1  (OmniRoute on a VPS, behind HTTPS)
Donation platforms ──webhooks──▶ /api/webhooks/*   (signature/token verified, idempotent)
Vercel cron (daily) ──▶ /api/cron/recheck-links    (link health + ledger month rollover)
```

---

## 1. Environment variables

Set these in Vercel → Project → Settings → Environment Variables (Production, and Preview if you
use it), or with `vercel env add NAME production`. Never commit them.

### Core
| Variable | Required | What it is |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | yes | The full service-account JSON as **one line**. Firebase console → Project settings → Service accounts → Generate new private key. Minify it first, for example with `jq -c . key.json`. Missing or invalid JSON makes routes return 503 `ConfigError`. |
| `APP_ID` | yes | Must equal the client's `VITE_APP_ID`, because every document lives under `artifacts/{APP_ID}/`. Default `openexam-hub` on both sides. |
| `ALLOWED_ORIGIN` | yes in prod | Origins allowed by CORS, comma-separated, for example `https://openexamhub.org,https://www.openexamhub.org`. Default `*`. |
| `ADSENSE_PUBLISHER_ID` | no | AdSense publisher id (`pub-…`). `/ads.txt` is served only when this is set, otherwise 404. |
| `VITE_ADSENSE_CLIENT` | no | AdSense client (`ca-pub-…`), build-time. Ads load only on `/app` for signed-in users, after Google's consent message. |
| `VITE_ADSENSE_SLOT` | no | Numeric id of the dashboard display ad unit, build-time. Both VITE_ADSENSE_* must be set for ads to show. |
| `CRON_SECRET` | yes | A random string (`openssl rand -hex 32`). Vercel sends `Authorization: Bearer $CRON_SECRET` to cron routes automatically once this variable exists. |
| `ADMIN_SECRET` | yes | A random string (`openssl rand -hex 32`) for `/api/admin/*`. Send it as `Authorization: Bearer …`. Keep it out of the browser. |

### LLM gateway (`lib/llm.js`)
| Variable | Required | What it is |
|---|---|---|
| `LLM_BASE_URL` | yes | OpenAI-compatible base URL **including `/v1`**, for example `https://llm.example.org/v1` (OmniRoute). |
| `LLM_API_KEY` | yes | The OmniRoute API key from Dashboard → **Endpoints**, or the key for any other OpenAI-compatible endpoint. |
| `LLM_MODEL` | no | The default model or combo for every agent. Default `auto`, which lets OmniRoute pick among eligible connections. |
| `LLM_MODEL_<AGENT>` | no | A per-agent override. AGENT is one of `DISCOVERY`, `PLANNER`, `FORMAT`, `DIAGNOSTIC`, `COACH`, `PRACTICE`, `EXPANSION`. Example: `LLM_MODEL_PLANNER=groq/llama-3.3-70b-versatile`, or the name of an OmniRoute combo. |
| `LLM_FALLBACK_BASE_URL` | no | A second OpenAI-compatible endpoint, used when the primary errors (4xx/5xx/timeouts). A cheap **paid** API is recommended once you have real traffic. |
| `LLM_FALLBACK_API_KEY` | with fallback | The key for the fallback endpoint. |
| `LLM_FALLBACK_MODEL` | with fallback | The model id on the fallback endpoint, or a comma-separated list tried in order (e.g. `gemini-3.1-flash-lite,gemini-3-flash-preview`). Put `gemini-3.1-flash-lite` first: it has higher free limits than `gemini-3-flash-preview`. Check ids with the provider's models.list before setting them: Gemini retired `gemini-2.5-flash` for new keys, and `gemini-flash-latest` / `gemini-3.8-flash` were overloaded (503/timeouts) on 21 Nov 2026. Keep OpenRouter's free tier (50 requests/day, account-wide) out of this chain, or last. |
| `LLM_FALLBACK2_BASE_URL` | no | A third OpenAI-compatible endpoint, tried after `LLM_FALLBACK_*`. For Cloudflare Workers AI: `https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1`. |
| `LLM_FALLBACK2_API_KEY` | with fallback 2 | The Bearer token for the second fallback endpoint (a Cloudflare API token with Workers AI rights). |
| `LLM_FALLBACK2_MODEL` | with fallback 2 | The model id on the second fallback endpoint, or a comma-separated list tried in order (e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`). |

### Donations
| Variable | Required | What it is |
|---|---|---|
| `GITHUB_SPONSORS_WEBHOOK_SECRET` | yes | The "Secret" you type when creating the Sponsors webhook. It is used for the `X-Hub-Signature-256` HMAC check. |
| `KOFI_VERIFICATION_TOKEN` | yes | The Verification Token shown on ko-fi.com/manage/webhooks (under *Advanced*). |
| `OPEN_COLLECTIVE_WEBHOOK_TOKEN` | yes | A random string (`openssl rand -hex 32`) that you put in the webhook URL as `?token=`. Open Collective webhooks carry no signature (see §5.3). |
| `OPEN_COLLECTIVE_SLUG` | yes | Your collective's slug, for example `openexam-hub`. Transactions on any other account are ignored. |
| `OPEN_COLLECTIVE_API_TOKEN` | no | An Open Collective Personal Token (personal settings → *For developers*), sent as the `Personal-Token` header on the re-confirmation query. Public reads work without it. It only raises rate limits. |
| `FX_<CUR>_EUR` | per currency | Rate to EUR, for example `FX_USD_EUR=0.92`, `FX_GBP_EUR=1.17`, `FX_CHF_EUR=1.05`, `FX_CAD_EUR=0.66`. EUR is always 1. GitHub Sponsors is always **USD**, so `FX_USD_EUR` is effectively required. If a rate is missing, the event is still recorded, but it is **left out of the EUR total** and gets the flag `missing_fx_rate` (`amountEur: null`, `countedInTotal: false`; `monthly_ledger.pendingFxEvents` goes up by one). Update the rates monthly. |

### Signup alerts (`lib/signupAlert.js`)

The founder gets a branded email each time someone creates an account. The app calls
`POST /api/account {action:'signup-notify'}` right after a new account signs in, fire-and-forget. The
server checks the Firebase ID token, skips anonymous accounts and accounts older than 24h, and sends at
most one alert per account. Dedupe uses the server-only doc `public/data/signup_alerts/{uid}`. The nightly
`/api/cron/cleanup` run re-sends any alert from the last 48h that never went out. It reuses
`FIREBASE_SERVICE_ACCOUNT`.

| Variable | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | for alerts | Resend API key (domain openexamhub.org). If it is missing, alerts are logged and skipped, and sign-up still works. |
| `SIGNUP_ALERT_TO` | no | Recipient. Default `elantaki.dijadiss@gmail.com`. |
| `SIGNUP_ALERT_FROM` | no | Sender. Default `OpenExam Hub <notifications@openexamhub.org>`. |
| `USER_EMAIL_FROM` | no | Sender of learner emails (verify / welcome). Default `OpenExam Hub <hello@openexamhub.org>`, reply-to hello@. |

**Learner emails (`lib/userEmails.js`).** The same `signup-notify` call sends email/password accounts a branded
"Verify your email" message. Its link comes from firebase-admin `generateEmailVerificationLink` and continues to
`https://openexamhub.org/app`. Google accounts, which Google has already verified, get a one-time welcome email
instead. `POST /api/account {action:'resend-verification'}` allows one send per 60s and 5 per 24h per account,
tracked in the server-only doc `public/data/user_emails/{uid}`. When Resend is missing or fails, the API
answers `fallback` and the app sends Firebase's own verification email. The app shows a dismissible
"verify your email" banner (EN/FR) to unverified email/password users and never blocks them. Verification links
need openexamhub.org and www.openexamhub.org in Firebase Auth > Authorized domains (both were present on
21 Nov 2026).

Tests: `node scripts/test-signup-alert.mjs` (offline) and `npm run test:signup-alert` (emulators plus a mock Resend).

### Library
| Variable | Required | What it is |
|---|---|---|
| `EXTRA_ALLOWED_DOMAINS` | no | A comma-separated list of extra official domains, used for new exams. Example: `cervantes.es,testdaf.de,celpip.ca`. Use bare hostnames only (no scheme, path or wildcard). Subdomains are included automatically. Invalid entries are ignored with a warning. Never add multi-tenant hosts (`github.io`, `blogspot.com`) or public suffixes (`co.uk`). Mirror the same list in src/App.jsx's allowlist so the client agrees. Redeploy after changing it. |

| `RESOURCE_IDS_V3` | no | Set to `1` **only after** `scripts/migrate-v3.mjs` has run on the project. New library writes then use the v3 resource id (sha1 of the canonical URL). Leave unset before the backfill. For the 9 seeded resources the legacy and v3 ids are identical, so they never move. |

Other routes (roadmap, plan, stats, events, diagnostic, coach, practice) use only the variables above.

---

## 2. Deploy to Vercel

```bash
npm i -g vercel
vercel link            # create or link the project; root directory = repo root
vercel env add FIREBASE_SERVICE_ACCOUNT production   # repeat for every variable in §1
vercel --prod
```

Or import the GitHub repo in the Vercel dashboard (root directory = `./`); `vercel.json` already sets
`framework: vite`, `buildCommand: npm run build` and `outputDirectory: dist`.

* The function runtime comes from `package.json` (`"type": "module"`, `engines.node: 24.x`, region `fra1` next to Firestore eur3). The build step is `vite build` for the frontend only; `api/**` is bundled by Vercel.
* **Function budget:** Hobby allows 12 Serverless Functions per deployment and every file in `api/` is one. The repo ships 8: `generate-roadmap`, `diagnostic`, `coach`, `practice`, and four dispatchers, `api/[route].js` (`/api/check-link`, `/api/library`), `api/admin/[action].js`, `api/webhooks/[provider].js` and `api/cron/[job].js`. Handlers live in `lib/routes/`. Public URLs are unchanged, so webhook registrations stay the same. New endpoints go into a dispatcher table, not a new `api/` file (see ARCHITECTURE.md §C.8).
* `vercel.json` rewrites every non-`/api/` path to `/index.html` (SPA). Same-origin `/api` means the client needs no `VITE_API_BASE`.
* Client build variables (`VITE_*`, see `.env.example`) are optional: `src/firebaseConfig.js` defaults to the public `openexam-hub` web config. `VITE_SERVER_ENABLED=false` builds a preview-only UI that never calls `/api`.
* `vercel.json` sets a **daily** cron (`0 3 * * *`, 03:00 UTC) for `/api/cron/recheck-links` and gives `api/cron/*.js` and `api/admin/*.js` (so `/api/cron/recheck-links` and `/api/admin/expand`) `maxDuration: 300`. On Hobby the cap is 300 s and only daily crons are allowed. Each run checks 150 links and stops starting new checks after 240 s, so each run fits the limit and the whole library is re-checked about every `N/150` days.
* To smoke-test the cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/recheck-links`.
* Crons: `recheck-links` (daily) and `rollup` (03:30 UTC: folds usage/calibration buckets, writes `stats/public`, rebuilds shelves).
* **Before go-live, reset the old browser-written treasury.** The old client wrote sample and arbitrary amounts into `treasury/monthly_ledger` and `ledger_events`. Delete `artifacts/{APP_ID}/public/data/treasury/monthly_ledger` and every existing `ledger_events/*` doc in the Firestore console. (`lib/ledger.js` also ignores the money fields of any ledger doc that has no `month`, keeping only `adsenseBridge`. Deleting the old events is still needed to clean the public feed.)

### Rate-limit the expensive routes (recommended)
`/api/generate-roadmap` (especially with `forceRefresh: true`), `/api/practice` and
`/api/diagnostic` can trigger live LLM calls, so one abusive client can burn your free-tier quotas.
Add a Vercel Firewall rule: Project → **Firewall** → **Configure** → **New rule**:
* **If** Request Path *matches* `^/api/(generate-roadmap|practice|diagnostic)$`
* **Then** **Rate Limit**: fixed window, 60 s, about 10 requests, keyed on **IP**. Action: *Too Many Requests (429)*.
* Optionally add a stricter second rule for requests whose body contains `"forceRefresh":true`, or handle that in code.
The webhooks, cron and admin routes are already authenticated, so they don't need this rule.
Check your plan's Firewall limits on vercel.com/docs/vercel-firewall.

---

## 3. Firestore rules, indexes, TTL and the v3 backfill

`firestore.rules` (v3 data model, ARCHITECTURE.md §B.9):
* `artifacts/{appId}/public/data/{coll}/{doc}`: `get` for the public collections (resources, shelves, plans, exam_profiles,
  practice_sets, item_sets, ledger_events, treasury, stats, legacy global_verified_roadmaps/metrics); `list` **only with
  `limit <= 100`**; server-only collections (counters, usage_buckets, calib_buckets, link_checks) are not readable. **No client writes.**
* `users/{uid}/roadmaps/{id}`: owner only, shape-checked (≤ 30 keys, level A1–C2, days 1–180, `progress.done` map ≤ 2000,
  `calendar` ≤ 180, id == doc id). `users/{uid}/srs/{id}` and `users/{uid}/placement/{EXAM}`: owner only, validated keys.
* Everything else is denied.

`firestore.indexes.json` adds the v3 composite indexes (resources `exams`+`approved`+`linkStatus`, `approved`+`nextCheckAt`,
srs `exam`+`due`) and index exemptions for big maps (`roadmaps.progress`, `plans.resources`, `shelves.bySkill`, ...).

**Deploy order (important):**
1. Indexes first: `firebase deploy --only firestore:indexes` (they take a few minutes to build). Until the
   `approved`+`nextCheckAt` index exists, the link cron falls back to the old `orderBy lastCheckedAt` scan (reported as `queryMode`).
2. Rules **only after** the App build with the bounded ledger feed (`orderBy createdAt desc, limit 20`) is live,
   because the new rules reject unbounded lists: `firebase deploy --only firestore:rules`.

```bash
npm i -g firebase-tools
firebase login
firebase use openexam-hub
firebase deploy --only firestore:indexes
# after the App deploy is live:
firebase deploy --only firestore:rules
```

**Expiry without billing:** Firestore TTL needs a billing account, which this project does not have. The nightly
`/api/cron/cleanup` job (04:15 UTC, `lib/routes/cron/cleanup.js`) does the same work: it deletes docs in the four
collections below whose `expireAt` has passed (old shared plans without `expireAt` use `cachedAt` + 30 days) and removes
anonymous Firebase Auth users older than 7 days together with their `users/{uid}` data. It logs the counts.
`GET /api/cron/cleanup?dry=1` with `Authorization: Bearer $CRON_SECRET` only counts. If billing is ever enabled, the
TTL policies below can take over the expiry part.

**TTL policies** (optional, needs billing; one-time, Google Cloud console or gcloud):
```bash
for c in plans usage_buckets calib_buckets link_checks; do
  gcloud firestore fields ttls update expireAt --collection-group=$c --enable-ttl --project openexam-hub
done
```

**v3 backfill** (`scripts/migrate-v3.mjs`, idempotent; ARCHITECTURE.md §B.12 steps 2–3). It adds the v3 fields
(site, dedupKey, tier, shelfKeys, nextCheckAt, checkIntervalDays, completionCount, consecutiveDead) to existing resources,
moves ids only for URLs whose canonical form changed (old doc kept with `duplicateOf` + `approved:false`), retires
near-duplicates, deletes plans citing retired ids, builds the shelves and writes `stats/public`.
```bash
node scripts/migrate-v3.mjs                      # dry run: prints what it would change, writes nothing
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node scripts/migrate-v3.mjs --write   # emulator
# production (manual, after reviewing the dry run):
FIREBASE_SERVICE_ACCOUNT=... APP_ID=openexam-hub node scripts/migrate-v3.mjs --write --i-understand-this-writes-production
```
Then set `RESOURCE_IDS_V3=1` in Vercel and redeploy. Without the backfill everything still works: legacy docs are
rechecked by the `lastCheckedAt` fallback, shelves are built on demand, and derived fields are computed on read.

The rules are exercised by `npm run e2e` against the emulator (public reads, no client writes, bounded lists,
owner-only roadmaps with field-path ticks, SRS card validation).

---

## 4. Admin endpoints (exam expansion)

All admin endpoints need `Authorization: Bearer $ADMIN_SECRET` and accept JSON.

```bash
# 1. Draft resources for a new exam. The exam board's domain must already be allowlisted:
#    add it to EXTRA_ALLOWED_DOMAINS (and src/App.jsx) and redeploy first.
curl -X POST https://<app>/api/admin/expand -H "Authorization: Bearer $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"exam":"DELE","levels":["B1","B2"]}'
#    -> { saved:[{id,url,title,...,approved:false}], rejected:[{url,reason}], suggestedDomains:[...] }
#    suggestedDomains are model suggestions. Verify they are the official board before allowlisting.

# 2. Review each saved URL by hand, then approve the good ones
curl -X POST https://<app>/api/admin/approve -H "Authorization: Bearer $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"resourceIds":["<24-hex id>"],"approve":true}'

# 3. After checking an exam format fact sheet against its sourceUrl
curl -X POST https://<app>/api/admin/review-profile -H "Authorization: Bearer $ADMIN_SECRET" \
  -H 'Content-Type: application/json' -d '{"exam":"DELE","reviewed":true}'
```

The link-maintenance cron sets `approved:false` and `deadSince` once a link has been **dead twice in
a row** (404/410/DNS). It also deletes every `global_verified_roadmaps` doc that cites that link,
so the next request rebuilds the roadmap. If a link comes back to life, it stays unapproved until
you approve it again with `/api/admin/approve`. Timeouts and 5xx errors never count as dead. Each
run's summary is stored at `public/data/metrics/link_health`.

---

## 5. Register the donation webhooks

### 5.1 GitHub Sponsors
1. github.com/sponsors/**<you>**/dashboard → **Webhooks** → **Add webhook**. For an org, use the org's Sponsors dashboard.
2. Payload URL: `https://<app>/api/webhooks/github-sponsors`
3. Content type: `application/json` (form-encoded also works).
4. Secret: the value of `GITHUB_SPONSORS_WEBHOOK_SECRET`.
5. Save. GitHub sends a `ping`, which gets a 200 reply. Use *Recent Deliveries → Redeliver* to re-test. Redeliveries keep the same `X-GitHub-Delivery`, so they are no-ops.

How events are handled (per GitHub's `sponsorship` event docs): `created` adds the tier's
`monthly_price_in_cents` (USD) to `githubSponsors`, the monthly recurring revenue, which does not
reset each month. `cancelled` subtracts it; GitHub sends this when the last billing cycle ends.
`tier_changed` adds `new − changes.tier.from`. `pending_cancellation`, `pending_tier_change` and
`edited` change no money. When `privacy_level: "private"`, the feed shows "Anonymous sponsor" and
no tier name. **One-time** sponsorships (`tier.is_one_time`) go into `githubOneTime` instead, which
resets monthly.

### 5.2 Ko-fi
1. ko-fi.com/manage/webhooks → Webhook URL: `https://<app>/api/webhooks/kofi` → Update.
2. Under *Advanced*, copy the **Verification Token** into `KOFI_VERIFICATION_TOKEN`.
3. Use *Send Single Donation Test* to check the setup.

Ko-fi posts `application/x-www-form-urlencoded` with one `data` field holding JSON, and retries
until it gets a 200 with the same `message_id`; that id is the idempotency key. Only `Donation` and
`Subscription` are counted, into `koFiTips`, which resets monthly. `Shop Order` and `Commission`
get a 200 reply and are ignored. When `is_public` is false, the name and message are not stored.
Emails and shipping data are never stored.

### 5.3 Open Collective: what verification exists today
* **No signature.** The generic webhook (Collective → Settings → **Webhooks**) is a plain JSON `POST` of the activity. There is no HMAC, secret, or signature header. Verified against the `opencollective-api` source (`server/lib/notifications/index.ts` → `axios.post(webhookUrl, activity)`) and the public docs, November 2026.
* That is why this endpoint uses **two defenses**:
  1. **A secret token in the URL.** Register `https://<app>/api/webhooks/open-collective?token=<OPEN_COLLECTIVE_WEBHOOK_TOKEN>`. It is compared in constant time.
  2. **Re-confirmation.** The payload is treated only as a hint. The server re-reads the transaction by its UUID from the public GraphQL API (`https://api.opencollective.com/graphql/v2`, `transaction(transaction:{id})`) and counts only what the API returns: the amount, the currency, that the account is `OPEN_COLLECTIVE_SLUG`, that the kind is `CONTRIBUTION`/`ADDED_FUNDS`, and that the type is `CREDIT`. A refund (`DEBIT` + `isRefund`) is subtracted. A forged payload can't inflate the total. At most it can replay a real transaction, and the idempotency key (the transaction UUID) makes that a no-op.
* Setup: Collective → Settings → Webhooks → add the URL above → activity **"New transaction"** (`collective.transaction.created`).
* Caveats: Open Collective does **not retry** failed deliveries; it ignores the failure. If the API is down, the route returns 503 and the contribution is missed, so compare the month against the collective's transactions page. The token sits in a URL, so keep it out of screenshots and rotate it if it leaks (change the env var and the webhook URL together). Incognito contributors show as "Anonymous backer".

### Ledger model (all sources)
`treasury/monthly_ledger` = `{month:'YYYY-MM' (UTC), githubSponsors, githubOneTime, openCollective,
koFiTips, adsenseBridge, communityTotalEur, pendingFxEvents, updatedAt}`. Every event runs one
Firestore transaction:
1. If `ledger_events/{source}-{eventId}` exists, stop: duplicate, reply 200.
2. If the month changed, archive the old ledger to `treasury/{YYYY-MM}` and reset `githubOneTime`, `openCollective` and `koFiTips`. `githubSponsors` and `adsenseBridge` carry over.
3. Apply the EUR delta. Totals are clamped at 0, with the flag `clamped_at_zero`.
4. `create()` the event doc. A concurrent duplicate fails the commit and is reported as a duplicate.

The daily cron also rolls the month over, so tips reset on the 1st even if nobody donates.
`communityTotalEur` is what the ad kill-switch should compare with €350.83. `adsenseBridge` is
written only by hand or by a future job.

---

## 6. Self-host the LLM gateway: OmniRoute (recommended)

OmniRoute (github.com/cheaper-inference/OmniRoute, formerly `diegosouzapw/OmniRoute`; npm
`omniroute`, Docker `diegosouzapw/omniroute`) is an OpenAI-compatible gateway. It pools many
providers behind `http://<host>:20128/v1`, with quota-aware fallback, and `model: "auto"` picks an
eligible connection. It keeps its state in **SQLite** (one process, one writer), so it **cannot run
on Vercel functions**. Run it on a small always-on host:
* A €4–6/month VPS (Hetzner CX22, OVH, Scaleway) with 2 GB RAM. The image defaults to a 1 GB V8 heap for dashboard and light chat, so give the container at least 2 GB, **or**
* Fly.io or Railway with a persistent volume mounted at `/app/data`.

Run exactly **one** replica. Its docs warn that several replicas on the same SQLite file corrupt it.

### 6.1 Install with Docker Compose and Caddy for HTTPS
Point a DNS A record (for example `llm.example.org`) at the VPS, open ports 80 and 443 only, then:

```bash
mkdir -p ~/omniroute && cd ~/omniroute
cat > .env <<ENV
REQUIRE_API_KEY=true                       # /v1 requires an OmniRoute key (default is false = open proxy!)
AUTH_COOKIE_SECURE=true                    # we are behind HTTPS
JWT_SECRET=$(openssl rand -base64 48)      # dashboard session signing
API_KEY_SECRET=$(openssl rand -hex 32)     # encrypts API keys at rest
STORAGE_ENCRYPTION_KEY=$(openssl rand -hex 32)   # full SQLite encryption; BACK THIS UP, losing it = losing data
INITIAL_PASSWORD=$(openssl rand -base64 18)      # dashboard password; write it down, then change it in Settings → Security
OMNIROUTE_WS_BRIDGE_SECRET=$(openssl rand -base64 32)
NEXT_PUBLIC_BASE_URL=https://llm.example.org
BASE_URL=http://omniroute:20128
ENV
chmod 600 .env

cat > docker-compose.yml <<'YML'
services:
  omniroute:
    image: diegosouzapw/omniroute:latest   # pin a version (e.g. :3.8.54) once it works
    container_name: omniroute
    restart: unless-stopped
    stop_grace_period: 40s                  # lets SQLite WAL checkpoint on stop
    env_file: .env
    environment:
      - PORT=20128
    volumes:
      - omniroute-data:/app/data            # DB, encrypted provider keys, config
    # no "ports:" — only Caddy can reach it
  caddy:
    image: caddy:latest
    container_name: caddy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from https://llm.example.org --to http://omniroute:20128
    volumes:
      - caddy-data:/data
volumes:
  omniroute-data:
  caddy-data:
YML

docker compose up -d
docker compose logs -f omniroute    # wait for it to be ready
curl -fsS https://llm.example.org/healthz
```

Without a domain, you can bind it to loopback only (`-p 127.0.0.1:20128:20128`) and use a
Cloudflare Tunnel or Tailscale Funnel for HTTPS. The dashboard's "Quick Tunnel" URLs change on
every restart, so they aren't suitable for `LLM_BASE_URL`. Alternative without Docker:
`npm install -g omniroute && omniroute`. It keeps its data in `~/.omniroute`; run it under systemd
behind the same Caddy or nginx.

### 6.2 First login and locking down the dashboard
1. Open `https://llm.example.org` and log in with `INITIAL_PASSWORD`. If the onboarding wizard asks for a bootstrap token: `docker logs omniroute | grep BOOTSTRAP`. **Do not skip the password step.** Skipping it turns dashboard login off.
2. Change the password in Settings → Security. Keep `REQUIRE_API_KEY=true`. Note that `GET /v1/models` follows the dashboard login setting rather than `REQUIRE_API_KEY`, so a 401 there doesn't prove inference is protected. Test with a key-less `POST /v1/chat/completions`, which must return 401.
3. Restrict the dashboard further. Only `/v1/*` needs to be public, so in Caddy you can proxy just `/v1/*` publicly and reach the dashboard over SSH (`ssh -L 20128:omniroute:20128 …`), Tailscale, or an IP allowlist / basic auth on every other path.
4. Don't enable the optional `cli`, `host`, `web` or `autoupdate` profiles or the Docker-socket updater on a public server.
5. Back up the `omniroute-data` volume and the `.env` file. Without `STORAGE_ENCRYPTION_KEY` and `API_KEY_SECRET`, the backup is unreadable.

### 6.3 Connect free providers (official API keys ONLY)
Dashboard → **Providers** → add a provider → paste its API key. Use **only official, API-key free
tiers whose terms allow your use**, for example:
* **Google Gemini API** (aistudio.google.com API key, free tier)
* **Groq** (console.groq.com)
* **OpenRouter** `:free` models (openrouter.ai key)
* **Mistral** (La Plateforme free tier)
* **GitHub Models** (a GitHub token with the models permission)
* **Cerebras**, **NVIDIA NIM**, **Cloudflare Workers AI**, **SambaNova** and similar developer API tiers

**Do not connect**, for a public app:
* any **"web cookie" / web-session provider** (Gemini Web, ChatGPT web and similar, which need the `-web` image and Playwright), and
* any **OAuth reuse of personal coding-tool subscriptions** (Claude Code, Codex, Cursor, Kiro, Copilot and similar).

Those break provider terms when they serve a public website's traffic, and they can get your
accounts banned. When that happens, the app's AI stops working with no warning.
Leave OmniRoute's default `excludeTosAvoid` on, so providers marked **`tos: avoid`** stay out of
`auto` routing; connecting such an account does not override it, and you shouldn't try to. Read
OmniRoute's Free Tiers Guide (`docs/getting-started/FREE-TIERS-GUIDE.md`) and each provider's
current terms. **The free-tier terms of each provider still apply when traffic goes through the
gateway.** Some forbid production use, and some log prompts (for example, Logfare logs every
request). Learners' text is sent to these providers, so mention that in the privacy policy.

### 6.4 Get the key and point the server at it
1. Dashboard → **Endpoints** → create or copy an **OmniRoute API key**.
2. Test it:
   ```bash
   curl https://llm.example.org/v1/chat/completions -H "Authorization: Bearer $KEY" \
     -H 'Content-Type: application/json' -d '{"model":"auto","messages":[{"role":"user","content":"Reply with {\"ok\":true}"}]}'
   ```
3. In Vercel set `LLM_BASE_URL=https://llm.example.org/v1`, `LLM_API_KEY=<that key>`,
   and optionally `LLM_MODEL=auto` and per-agent `LLM_MODEL_<AGENT>` (a provider/model id or an OmniRoute combo name). Redeploy.
4. Strongly recommended: set `LLM_FALLBACK_*` to a cheap paid API, because free tiers have no SLA and run out late in the (UTC) day.

### 6.5 Alternative: FreeLLMAPI
FreeLLMAPI (github.com/tashfeenahmed/freellmapi) is a similar self-hosted router, also SQLite and
also OpenAI-compatible. Install it with Docker: `git clone` the repo, write
`ENCRYPTION_KEY=$(openssl rand -hex 32)` and `PORT=3001` into `.env`, then `docker compose up -d`. It
listens on `127.0.0.1:3001`; put the same Caddy reverse proxy in front instead of using
`HOST_BIND=0.0.0.0`. Create the dashboard account, add official provider keys on **Keys**, and copy
the unified `freellmapi-…` key from the Keys page header. Then set
`LLM_BASE_URL=https://llm.example.org/v1` and `LLM_API_KEY=freellmapi-…`. Its README states it is
**"for personal experimentation and learning, not production"** and tells you to swap in a paid API
before shipping. The same rules apply as for OmniRoute: use only official API-key tiers, and each
provider's terms still apply.

---

## 7. Verify

```bash
for f in $(find api lib -name '*.js'); do node --check "$f" || echo "FAIL $f"; done
node scripts/test-ledger.mjs     # offline: webhooks, idempotency, rollover, FX, dead-link logic
node scripts/test-usage.mjs      # offline: expense totals, token pricing, usage recording, /api/stats
```

### End-to-end test (local, no production accounts needed)

```bash
npm install          # dev deps: firebase-tools (emulator, needs Java 11+), firebase + @firebase/rules-unit-testing
npm test             # the four offline unit suites (orchestrator, learner agents, ledger, algo)
npm run e2e          # Firestore emulator (project demo-openexam, rules + indexes from the repo root), mock OmniRoute
                     # (scripts/mock-llm.mjs), api/** via scripts/local-server.mjs, live link checks
```
`npm run e2e` starts and stops everything itself and refuses any project id that does not start
with `demo-`, so it can never write to the real Firebase project.

## 8. Cloudflare Workers (static hosting at the edge, API on Vercel)

`wrangler.jsonc` + `worker/index.js` serve the site from **Cloudflare Workers Static Assets** (free and
unmetered for static files, including the demo video's bandwidth) and **proxy `/api/*` and `/ads.txt` to the
Vercel deployment** (`API_ORIGIN`, default `https://openexam-hub.vercel.app`). Vercel keeps running every Node
function and all three cron jobs, so nothing runs twice and no server code changed.

Why not the API on Workers too: on the Workers **Free** plan an invocation gets 10 ms of CPU and 50 external
subrequests. `firebase-admin` cannot run in workerd (protobufjs code generation is blocked), and the routes
make more outbound calls than that (the `recheck-links` cron checks up to 150 links; roadmap builds do link
checks + Firestore + LLM calls). Moving the API needs Workers Paid and a REST rewrite of the Firestore/Auth layer.

What the Worker does (everything else is a plain asset hit and never runs the script):

| Path | Behaviour (same as vercel.json) |
| --- | --- |
| `/api/*` | proxied to `API_ORIGIN` (method, headers, body, status passed through; redirects not followed) |
| `/ads.txt` | proxied to `API_ORIGIN/api/ads-txt` |
| `/demo/*` | served with `Range` support (206) through the Cache API; Static Assets alone only answers 200 |
| `/blog/` | same page as `/blog` |
| missing file | `/app/<tab>` deep links get the `/app` shell (200); any other unknown path is a real 404 (all public pages are prerendered) |
| host `www.` | 308 to the apex (backup; the zone Redirect Rule does it first) |

`scripts/cf-build.mjs` runs the production build (`VERCEL_ENV=production`, so blog drafts are excluded) and writes
`dist/_headers` (HSTS, `Access-Control-Allow-Origin: *`, immutable `/assets/*`, demo cache headers, VTT type).
Trailing-slash variants of blog pages (`/blog/<slug>/`) answer 307 to the canonical no-slash URL.

```bash
export VITE_ADSENSE_CLIENT=ca-pub-9692106045195909     # same value as on Vercel
npm run cf:build
npx --yes wrangler@4.166.0 deploy --env staging        # https://staging.openexamhub.org (Worker openexam-hub-staging)
npx --yes wrangler@4.166.0 deploy                      # production Worker openexam-hub
```

Visitor IPs: Vercel overwrites `x-forwarded-for` with the Worker's IP, so the Worker sends the visitor IP as
`x-oeh-client-ip` plus `x-oeh-proxy-key`; `/api/events` trusts it only when the key equals `PROXY_SHARED_SECRET`.
Set the same random value as a Vercel env var (Production) and as a Worker secret
(`npx wrangler secret put PROXY_SHARED_SECRET`) before the cutover, then redeploy Vercel.

**Content updates:** pushes to main deploy Vercel (API) automatically, but the static site on Cloudflare is
updated by `.github/workflows/cloudflare-deploy.yml`, which needs the repo secret `CLOUDFLARE_API_TOKEN`.
Until that secret exists, run `npm run cf:build && npm run cf:deploy` after each content push.

### Cutover (DNS)

DNS records before the cutover (all DNS-only, TTL auto), zone `7e685b3f9438eaf3f64a2c5d67e31a85`:

| id | type | name | content |
| --- | --- | --- | --- |
| `64bc0dc65536bbac0a816e9453933369` | A | openexamhub.org | 64.29.17.1 |
| `cbc688862062f21181acd463c4e16166` | A | openexamhub.org | 216.198.79.1 |
| `d311b840f39121e1a68741639db57ba4` | CNAME | www.openexamhub.org | 062ded5a105ee087.vercel-dns-017.com |

Never touch the MX, SPF, DKIM (`cf2024-1._domainkey`) or `google-site-verification` TXT records.

1. `routes` in `wrangler.jsonc` lists the apex custom domain. Delete the three records above
   (a Workers custom domain cannot sit on a hostname that already has an A/CNAME record), then run
   `npx --yes wrangler@4.166.0 deploy`. Expect a brief certificate issuance window for the hostname.
2. For www, add proxied originless DNS (AAAA `100::` and A `192.0.2.0`) and a zone Single Redirect:
   `http.host eq "www.openexamhub.org"` -> `concat("https://openexamhub.org", http.request.uri.path)`, 308, preserve query string. www is not a Worker custom domain.
3. Zone setting **Always Use HTTPS** must be on, and a backup Single Redirect `not ssl` ->
   `concat("https://", http.host, http.request.uri.path)` (301, preserve query string) covers HTTP on every host. The Worker also 301s `http://` to `https://` if a request ever reaches it.
4. Re-run the route parity check and `BASE_URL=https://openexamhub.org npm run e2e:gate`.

### Rollback (one step)

Done on 2026-11-20 at 22:56 Europe/Athens. The deleted records, the new custom domain ids, the redirect rule id and
the setting change are saved in `/workspace/oeh-cf-rollback.json` on the bot box.


Remove the Worker custom domains (`openexamhub.org`, `www.openexamhub.org`) in Workers > openexam-hub >
Settings > Domains & Routes, then re-create the three DNS-only records from the table above. The Vercel project
was never changed or deleted, so it serves again as soon as DNS resolves to it.
