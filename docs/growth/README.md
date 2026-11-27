# Growth / free backlink outreach (repo-only)

**Not part of the live website.** These files live in GitHub for the team. They are **not** imported by Vite, **not** copied into `dist/`, **not** linked from `src/`, and **not** served on [openexamhub.org](https://openexamhub.org).

- `tracker.html` - local backlink/article progress board (HTML/CSS/JS)
- `ideas.html` - **34-idea execution cockpit** (phases, P0/P1, collapsed tool checklists, notes, dependencies)
- `ideas.json` - enriched catalog copy for the cockpit (source also in `docs/ideas/`)
- `INDIEHACKERS_TODO.md` - next-session checklist for Indie Hackers (#8 unlock + DELE post)
- `_tmp-ih-dele-post.md` - draft body for the Indie Hackers DELE post
- `SKIP_TRAFFICGO.md` - why TrafficGo fake-visit offers are rejected for production
- `AY_AUTOMATE_AUDIT.md` - triage of AY Automate 120+ free-backlink list vs our CSV
- `FREE_BACKLINK_TARGETS.md` - summary and rules
- `free-backlink-targets-1000.csv` - master tracker (1000 rows)
- `_directories_catalog.csv` - upstream free/freemium catalog snapshot (reference only)

## Ideas cockpit (phases)

The Ideas board is an execution system, not a flat dump:

| Phase | Meaning |
|-------|---------|
| **now** | Wave 1 / do this week (mostly P0 free-tool and trust work) |
| **next** | After Wave 1 foundations |
| **later** | Valuable but not blocking |
| **adjacent** | Paid platform, Kickstarter, banking (do not compete with core free tools) |

Markdown deep specs live under [`docs/ideas/`](../ideas/). The HTML board is the day-to-day cockpit. Progress (tool checkoffs, status, notes) saves under `ideaOverrides` in the same disk backup as backlinks.

Regenerate catalog metadata:

```bash
node scripts/generate-idea-pages.mjs
```

## Open like an app (Desktop shortcut)

From this folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-desktop-shortcut.ps1
```

That places **OpenExam Hub Tracker** on your Desktop (company logo icon). Double-click it - it starts a tiny local server if needed and opens the tracker in your **default browser**. It is not an installed desktop app.

Open Ideas instead of Backlinks:

```powershell
$env:OEH_TRACKER_START='ideas'
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch-tracker.ps1
```

Or run:

```bat
OpenExamHub-Tracker.cmd
```

## Open the tracker locally (manual)

```bash
node docs/growth/serve-tracker.mjs
```

Then open:

- Backlinks: `http://127.0.0.1:5179/tracker.html`
- Ideas cockpit: `http://127.0.0.1:5179/ideas.html`
- Idea markdown specs: `http://127.0.0.1:5179/idea-docs/IDEA-01-anti-fluff-transparent-positioning.md`

Both boards share the local server.

Progress is stored in:

1. Browser `localStorage` (`oeh-growth-v1` for backlinks, `oeh-ideas-v1` for ideas)
2. `docs/growth/progress-local.json` (gitignored) - includes `overrides` + `ideaOverrides`
3. `%LOCALAPPDATA%\OpenExamHub\oeh-growth-v1.json` (machine backup)

Use **Import CSV** only if you open the HTML without the local server.

## Regenerate the target list

```bash
node scripts/generate-free-backlink-targets.mjs
node scripts/enrich-free-backlink-targets.mjs
```
