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

## Registered prompts

| Time | Request | Action |
|------|---------|--------|
| 2026-11-22 | Clone GitHub OpenExam here | Cloned `openexam-hub` into `.` (no exact `OpenExam` repo existed). |
| 2026-11-22 | Check unmerged PRs (Grok credits ran out) | Listed PRs + compared leftover branches to `main`. |
| 2026-11-22 | Install everything needed | npm ci, env template, Playwright, Firebase emulator; tests green. |
| 2026-11-23 | List 1000 free backlink / free-article places | CSV + MD under `docs/growth/`; Gmail leads noted. |
