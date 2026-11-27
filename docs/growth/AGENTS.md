# Agent / Grok entrypoint: internal growth trackers

**Not part of https://openexamhub.org.** These files are GitHub-only tooling for humans and coding agents (Cursor, Grok, etc.). They are never imported by Vite and never shipped in `dist/`.

## What to open

| Board | File | Purpose |
|-------|------|---------|
| Backlinks (1000) | [`tracker.html`](./tracker.html) | Free backlink / free-article outreach progress |
| Ideas (34) | [`ideas.html`](./ideas.html) | Idea execution cockpit (phases, tools, notes) |

Shared local server: [`serve-tracker.mjs`](./serve-tracker.mjs)

```bash
node docs/growth/serve-tracker.mjs
```

- Backlinks: http://127.0.0.1:5179/tracker.html  
- Ideas: http://127.0.0.1:5179/ideas.html  

## Related data

- Ideas catalog JSON: [`ideas.json`](./ideas.json) (also [`../ideas/ideas.json`](../ideas/ideas.json))
- Idea deep specs: [`../ideas/`](../ideas/) (`IDEA-01-*.md` …)
- Backlink CSV: [`free-backlink-targets-1000.csv`](./free-backlink-targets-1000.csv)
- Project log: [`../../PROJECT_TRACKER.md`](../../PROJECT_TRACKER.md)

## Progress storage (do not commit secrets)

Progress is local: browser `localStorage` + `progress-local.json` (gitignored) + `%LOCALAPPDATA%\OpenExamHub\`. Do not invent or commit real outreach credentials.

## Rules for agents

1. Prefer editing the cockpit HTML/JSON/CSV here; do not wire these boards into the live site.
2. Wave 1 ideas are `phase: now` + `priority: P0` in `ideas.json`.
3. Regenerating ideas: `node scripts/generate-idea-pages.mjs` (does not overwrite existing markdown notes).
