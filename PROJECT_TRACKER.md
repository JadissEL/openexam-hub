# PROJECT_TRACKER — OpenExam Hub

**Repo:** [JadissEL/openexam-hub](https://github.com/JadissEL/openexam-hub)  
**Local path:** `C:\Users\Jadiss\OneDrive\Bureau\OpenExam`  
**Live:** https://openexamhub.org

## Summary

Free study roadmaps for language exams (TEF Canada, TCF, IELTS, TOEFL iBT, Goethe, DELE) from official free materials. MIT licensed. Vite + React frontend, Vercel Node API, Firebase Auth + Firestore.

## Architecture

- Frontend: `src/` (Vite, React 18, Tailwind 3)
- API: `api/` (Vercel serverless, Node 24)
- Data: Firebase Auth + Cloud Firestore
- Worker: `worker/` (optional Cloudflare)
- Docs: `README.md`, `DEPLOY.md`, `CONTRACT.md`, `ARCHITECTURE.md`

This is **not** ShopTheBarber (no Fastify/Prisma/Clerk/Neon).

## Completed actions

| Date | Action |
|------|--------|
| 2026-11-22 | Cloned `JadissEL/openexam-hub` into this workspace (`main` @ `c90a4b2`). Bootstrapped local `.cursor_memory/`. |
| 2026-11-22 | Audited PRs vs `main`: only #5 still open (external a11y PR). Cursor PRs #6–#8 already merged. Leftover branches are stale. |
| 2026-11-22 | Local install: `npm ci`, `.env.local`, Playwright Chromium/WebKit, Firebase emulators. Offline `npm test` passed. |
| 2026-11-23 | Growth: 1000 free backlink/article targets in `docs/growth/` + `tracker.html` (repo-only; not wired into the website). |
| 2026-11-23 | Desktop “app-like” launcher: logo shortcut opens tracker in browser; progress dual-saved (browser + disk + `%LOCALAPPDATA%\OpenExamHub`). Still not on the live site. |
| 2026-11-24 | Catalogued all 34 product/growth ideas; created exhaustion tool pages under `docs/ideas/` (repo-only, not wired into the live site). |
| 2026-11-24 | Ideas now visible in the local growth UI: `docs/growth/ideas.html` + Backlinks/Ideas tabs on `tracker.html` (Desktop launcher server). |
| 2026-11-24 | Ideas board upgraded to execution cockpit: phases (now/next/later/adjacent), P0 Wave 1, collapsed cards, Next-up strip, notes, dependencies. |
| 2026-11-27 | Pushed internal growth trackers to GitHub for agents (Grok/Cursor); still not on openexamhub.org. Entry: `docs/growth/AGENTS.md`. |

## Idea catalog (34): execution cockpit

**Cockpit:** [docs/growth/ideas.html](docs/growth/ideas.html) (local) · **Index:** [docs/ideas/README.md](docs/ideas/README.md) · **JSON:** [docs/ideas/ideas.json](docs/ideas/ideas.json)  
**Rule:** An idea is exhausted only when every tool on its page is built, verified, or marked `wont-do` with a dated reason.  
**Scope:** Repo planning only. Not routes on openexamhub.org.  
**Wave 1 (now / P0):** IDEA-01, 02, 03, 07, 11, 12, 13, 27, 30, 34

| ID | Idea | Phase | Priority | Type | Category | Status | Page |
|----|------|-------|----------|------|----------|--------|------|
| IDEA-01 | High-trust anti-fluff & transparent positioning | now | P0 | product | Positioning & Trust | pending | [page](docs/ideas/IDEA-01-anti-fluff-transparent-positioning.md) |
| IDEA-02 | Zero-friction try first, save later onboarding | now | P0 | product | Onboarding & Product UX | pending | [page](docs/ideas/IDEA-02-try-first-save-later-onboarding.md) |
| IDEA-03 | Daily Today's Tasks & countdown workspace | now | P0 | product | Onboarding & Product UX | pending | [page](docs/ideas/IDEA-03-todays-tasks-countdown-workspace.md) |
| IDEA-04 | Shareable public study plans | next | P1 | product | Growth & Viral Loops | pending | [page](docs/ideas/IDEA-04-shareable-public-study-plans.md) |
| IDEA-05 | Lightweight daily/weekly reminder nudges | next | P1 | product | Engagement | pending | [page](docs/ideas/IDEA-05-daily-weekly-reminder-nudges.md) |
| IDEA-06 | Non-intrusive workspace UX & automated freshness checks | next | P1 | product | Trust & Ops | pending | [page](docs/ideas/IDEA-06-non-intrusive-ux-freshness-checks.md) |
| IDEA-07 | Global & local exam fee aggregator | now | P0 | product | Fees & Test Centers | pending | [page](docs/ideas/IDEA-07-exam-fee-aggregator.md) |
| IDEA-08 | 50/day batched test-center email outreach | next | P1 | ops | Fees & Test Centers | pending | [page](docs/ideas/IDEA-08-batched-test-center-email-outreach.md) |
| IDEA-09 | Publish pending verification official center listings | next | P1 | product | Fees & Test Centers | pending | [page](docs/ideas/IDEA-09-pending-verification-center-listings.md) |
| IDEA-10 | Crowdsourced price, date & link verification | later | P1 | product | Fees & Test Centers | pending | [page](docs/ideas/IDEA-10-crowdsourced-price-date-link-verification.md) |
| IDEA-11 | Interactive score & readiness calculators | now | P0 | product | SEO Tools & Calculators | pending | [page](docs/ideas/IDEA-11-score-readiness-calculators.md) |
| IDEA-12 | High-intent level + timeline study plan pages | now | P0 | product | SEO Tools & Calculators | pending | [page](docs/ideas/IDEA-12-level-timeline-study-plan-pages.md) |
| IDEA-13 | Side-by-side exam & score comparison pages | now | P0 | content | SEO Tools & Calculators | pending | [page](docs/ideas/IDEA-13-exam-score-comparison-pages.md) |
| IDEA-14 | Value-first participation in study & immigration communities | next | P1 | ops | Community & Partnerships | pending | [page](docs/ideas/IDEA-14-value-first-community-participation.md) |
| IDEA-15 | Booking through the platform | later | P2 | product | Booking & Conversion | pending | [page](docs/ideas/IDEA-15-booking-through-platform.md) |
| IDEA-16 | Broad partnership ecosystem (skipping exam makers for now) | later | P2 | ops | Community & Partnerships | pending | [page](docs/ideas/IDEA-16-broad-partnership-ecosystem.md) |
| IDEA-17 | University email & institutional discount/perk checker | next | P1 | product | University & Student Deals | pending | [page](docs/ideas/IDEA-17-university-email-discount-checker.md) |
| IDEA-18 | Direct outreach to universities for student deals | next | P1 | ops | University & Student Deals | pending | [page](docs/ideas/IDEA-18-university-direct-outreach.md) |
| IDEA-19 | Erasmus office & ESN chapter deals and visibility | later | P1 | ops | University & Student Deals | pending | [page](docs/ideas/IDEA-19-erasmus-esn-deals-visibility.md) |
| IDEA-20 | Bank & student-credit / financing partnerships for visa-approved high scorers | adjacent | P2 | ops | Financing & Perks | pending | [page](docs/ideas/IDEA-20-bank-student-credit-financing-partnerships.md) |
| IDEA-21 | Local & community radio exam prep & mobility segments | later | P2 | ops | Media & Distribution | pending | [page](docs/ideas/IDEA-21-local-community-radio-segments.md) |
| IDEA-22 | Relocation portals, study-abroad directories & international job/internship boards | later | P2 | ops | Media & Distribution | pending | [page](docs/ideas/IDEA-22-relocation-study-abroad-job-board-partners.md) |
| IDEA-23 | Non-competing study-tool & creator starter kit pairings | later | P2 | content | Community & Partnerships | pending | [page](docs/ideas/IDEA-23-study-tool-creator-starter-kits.md) |
| IDEA-24 | Tiered score-milestone perks (B2/C1 up to C2 + visa) | adjacent | P2 | product | Financing & Perks | pending | [page](docs/ideas/IDEA-24-tiered-score-milestone-perks.md) |
| IDEA-25 | Student-union handbooks & semester orientation resource kits | later | P2 | ops | University & Student Deals | pending | [page](docs/ideas/IDEA-25-student-union-handbooks-orientation-kits.md) |
| IDEA-26 | C2 + psychometric screening pipeline into paid immersive tutoring | adjacent | P2 | product | Monetization & Adjacent Platform | pending | [page](docs/ideas/IDEA-26-c2-psychometric-tutoring-pipeline.md) |
| IDEA-27 | Fast-setup supporter tips, open-source sponsorships & small sponsors | now | P0 | product | Monetization & Adjacent Platform | pending | [page](docs/ideas/IDEA-27-supporter-tips-sponsorships.md) |
| IDEA-28 | Kickstarter campaign with tiered access to paid immersive platform | adjacent | P2 | ops | Monetization & Adjacent Platform | pending | [page](docs/ideas/IDEA-28-kickstarter-tiered-immersive-access.md) |
| IDEA-29 | Active outreach over passive waiting (tips & EU grants realism) | now | P1 | strategy | Strategy & Launch | pending | [page](docs/ideas/IDEA-29-active-outreach-over-passive-waiting.md) |
| IDEA-30 | Zero-audience pre-launch strategy (borrow attention & proof first) | now | P0 | strategy | Strategy & Launch | pending | [page](docs/ideas/IDEA-30-zero-audience-prelaunch-borrow-attention.md) |
| IDEA-31 | Early-bird / waitlist capture before any crowdfunding push | adjacent | P1 | product | Strategy & Launch | pending | [page](docs/ideas/IDEA-31-early-bird-waitlist-capture.md) |
| IDEA-32 | Outreach to new platform / new tool reviewers | next | P1 | ops | Media & Distribution | pending | [page](docs/ideas/IDEA-32-new-platform-tool-reviewer-outreach.md) |
| IDEA-33 | Don't rely on Kickstarter as a fallback backlink play | next | P1 | strategy | Strategy & Launch | pending | [page](docs/ideas/IDEA-33-kickstarter-not-fallback-backlink-play.md) |
| IDEA-34 | Backlink stacking + Google footprint trust strategy | now | P0 | strategy | Strategy & Launch | pending | [page](docs/ideas/IDEA-34-backlink-stacking-google-footprint.md) |

**Regenerate catalog:** `node scripts/generate-idea-pages.mjs` (refreshes JSON + README; does not overwrite existing markdown notes).

## Open decisions / pending

- Execute Wave 1 product ideas as full-stack work starting with which P0 first.
- Whether any idea pages should later become public site routes (default: no; keep under `docs/ideas/`).

## Registered prompts

| Time | Request | Action |
|------|---------|--------|
| 2026-11-22 | Clone GitHub OpenExam here | Cloned `openexam-hub` into `.` (no exact `OpenExam` repo existed). |
| 2026-11-22 | Check unmerged PRs (Grok credits ran out) | Listed PRs + compared leftover branches to `main`. |
| 2026-11-22 | Install everything needed | npm ci, env template, Playwright, Firebase emulator; tests green. |
| 2026-11-23 | List 1000 free backlink / free-article places | CSV + MD under `docs/growth/`; Gmail leads noted. |
| 2026-11-23 | Desktop icon with logo; open in browser; progress never lost | Shortcut + local serve + disk/localStorage sync. |
| 2026-11-24 | Do Hashnode target #7 | Published DELE A2–B2 roadmap on openexamhub.hashnode.dev; tracker #7 live. |
| 2026-11-24 | Indie Hackers #8 | Product page live; community post gated for new members; draft ready; #8 in_progress. |
| 2026-11-24 | Add all 34 ideas to tracker + create a page per idea with tools to exhaust it | Catalog in `PROJECT_TRACKER.md`; 34 pages + index + `ideas.json` under `docs/ideas/`. |
| 2026-11-24 | Improve Ideas board into execution cockpit | Phases, Wave 1 P0, collapsed cards, Next-up, notes, deps; `ideas.html` + enriched JSON. |
