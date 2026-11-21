# OpenExam Hub blog posts

This folder is the blog. Each published (or draft) article is a Markdown file. The writer bot and human contributors add posts here; the site builds the index, tag pages, RSS feed and sitemap from these files.

## How a post is published

1. Add a new file `content/blog/<slug>.md`. The filename is the URL slug (`content/blog/my-title.md` becomes `https://openexamhub.org/blog/my-title`).
2. Open a pull request against `main`. Preview deploys include drafts, so you can read the post at `/blog/<slug>` on the preview URL.
3. Set `draft: false` when the post is ready.
4. After the PR is merged, Vercel deploys production automatically. Production builds **omit** every post with `draft: true`.

Do not invent testimonials, pass rates, prices, deadlines or university requirements. Link official sources for every factual claim, and set `lastVerified` to the date those pages were checked.

## File format

```markdown
---
title: "A clear, factual title"
description: "One or two sentences for listings, search results and social previews."
date: "2026-11-20"          # first published, YYYY-MM-DD
updated: "2026-11-20"       # last substantive edit, YYYY-MM-DD
lastVerified: "2026-11-20"  # date official sources were re-checked
exams:                      # one or more known exam ids
  - TEF_CANADA
  - IELTS
audience:                   # one or more of: students, professionals, immigration
  - students
  - professionals
lang: en                    # language of the post (en, fr, …)
draft: true                 # true = hidden on production, visible on preview
sources:
  - title: "Official page title"
    url: "https://example.gov/page"
cover:                      # optional; hero, list card and Open Graph image
  src: "/blog/my-title/cover.webp"
  alt: "A short description of the image"
  credit: "Diagram by OpenExam Hub."   # optional
faq:                        # optional; becomes an on-page FAQ and FAQPage JSON-LD
  - q: "A short question?"
    a: "A short, sourced answer."
---

The article body in Markdown. Use ## and ### headings (these become the table of contents).
Do not repeat the title as a # heading; the page already renders `title`.
```

### Fields

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Plain text, no trailing period unless the title is a question. |
| `description` | yes | Shown in the listing, `<meta name="description">` and Open Graph tags. |
| `date` | yes | ISO date. Used for sort order (newest first) and `datePublished`. |
| `updated` | yes | ISO date. Use the same value as `date` if the post is new. |
| `lastVerified` | yes | Shown on the page as “As of \<date\>”. Update this when you re-check sources. |
| `exams` | yes | From the known list below. These become tag filters and the “build a plan” CTA. |
| `audience` | yes | `students`, `professionals`, and/or `immigration`. |
| `lang` | yes | BCP 47 language tag for the article (`en`, `fr`, …). |
| `sources` | yes | List of `{title, url}`. URLs must be `https://`. Include every official page you rely on. |
| `draft` | yes | `true` or `false`. |
| `faq` | no | List of `{q, a}`. Optional. |
| `cover` | no | `{src, alt, credit?}`. `src` is a site path such as `/blog/<slug>/cover.webp` (files live in `public/blog/<slug>/`) or an `https://` URL. `alt` is required when `cover` is set. `credit` is optional and shown under the hero. If `cover` is omitted, the first image in the body (and an italic line immediately under it, if any) is used for the hero, the list card and the Open Graph image. |

### Known exam ids

`TEF_CANADA`, `TEF`, `TCF_CANADA`, `TCF`, `DELF`, `DALF`, `IELTS`, `CAMBRIDGE`, `TOEFL`, `GOETHE`, `TELC`, `TESTDAF`, `DELE`.

Use `TEF_CANADA` (not “TEF Canada”), `TCF_CANADA` for TCF Canada (not `TCF`, which is TCF tout public), and `GOETHE` (not “Goethe-Zertifikat”). The site turns these into reader-facing labels.

### Slugs

Lowercase kebab-case, letters, numbers and hyphens only: `ielts-for-professional-registration.md`. Do not rename a published slug; that would change the URL.

## What to write about

The blog is a 360° look at language exams, not only university admissions:

- What a given exam is used for (study, work, immigration, professional registration).
- Official dates, fee reductions or published changes, always with a source and a verification date.
- What universities, regulators or governments officially ask for in test results — quoted from their pages, not from memory.
- When it is sensible to start preparing, including for people who already work.
- Discounts or support that institutions themselves announce.

If a figure or deadline cannot be tied to a current official URL, leave it out.

## Example post

`example-when-to-start-preparing.md` is a format sample. It is marked `draft: true` and is labelled as an example in the body. Keep it as a draft, or replace it with a real, verified article and set `draft: false`.
