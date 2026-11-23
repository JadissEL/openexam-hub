# Growth / free backlink outreach (repo-only)

**Not part of the live website.** These files live in GitHub for the team. They are **not** imported by Vite, **not** copied into `dist/`, **not** linked from `src/`, and **not** served on [openexamhub.org](https://openexamhub.org).

- `tracker.html` — local progress board (HTML/CSS/JS)
- `FREE_BACKLINK_TARGETS.md` — summary and rules
- `free-backlink-targets-1000.csv` — master tracker (1000 rows)
- `_directories_catalog.csv` — upstream free/freemium catalog snapshot (reference only)

## Open the tracker locally

```bash
npx --yes serve docs/growth
```

Then open `/tracker.html`. Progress is stored in the browser (`localStorage` key `oeh-growth-v1`). You can also use **Import CSV** if `file://` blocks fetch.

## Regenerate the target list

```bash
node scripts/generate-free-backlink-targets.mjs
node scripts/enrich-free-backlink-targets.mjs
```
