import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePost,
  loadBlogPosts,
  includeDraftsFromEnv,
  buildSitemapXml,
  buildRssXml,
  articleJsonLd,
  blogIndexJsonLd,
  faqJsonLd,
  BLOG_INDEX_TITLE,
  BLOG_INDEX_DESCRIPTION,
  normalizeCover,
  firstBodyImage,
  resolveImageUrl,
  SITE_ORIGIN,
  CONTENT_DIR,
  BLOG_EXAMS,
  postHeadTitle
} from './blog-data.mjs';
import { SITEMAP_PATHS, TAG_INDEX_MIN_POSTS, allExamTags } from './blog-data.mjs';
import { parsePlannerQuery, parsePlannerDays, parsePlannerVariant, DEFAULT_PICKER_EXAM, resolvePlannerExam, resourceVariantScore, preferVariantResources, withOfficialSource, officialProfile } from '../lib/exams.js';
import * as siteModule from '../src/seo/site.js';
import { PLAN_PAGES, planPath } from '../src/seo/planPages.js';
import { DONATION_COPY, DONATION_LINKS, DONATION_PLATFORMS } from '../src/donations.js';
import { FAQ } from '../src/landing/content.js';
import { relatedPostsFor, RELATED_POST_SLUGS } from '../src/blog/related.js';

// Exam bodies, public broadcasters and governments only (study plans link nothing else).
const PLAN_LINK_HOSTS = [
  'canada.ca', 'france-education-international.fr', 'lefrancaisdesaffaires.fr', 'tv5monde.com', 'rfi.fr',
  'ielts.org', 'britishcouncil.org', 'cambridgeenglish.org', 'goethe.de', 'dw.com', 'vhs-lernportal.de'
];

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

const exampleFile = 'example-when-to-start-preparing.md';
const exampleRaw = fs.readFileSync(path.join(CONTENT_DIR, exampleFile), 'utf8');
const example = parsePost(exampleFile, exampleRaw);


const PAYPAL_URL = 'https://www.paypal.com/paypalme/JadissEL';

test('PayPal is the live primary funding link; unfinished platforms stay hidden', () => {
  assert.equal(DONATION_LINKS.paypal, PAYPAL_URL);
  assert.equal(DONATION_LINKS.kofi, 'https://ko-fi.com/openexamhub');
  assert.equal(DONATION_LINKS.githubSponsors, '');
  assert.equal(DONATION_LINKS.openCollective, '');
  assert.deepEqual(DONATION_PLATFORMS.map((p) => p.key), ['paypal', 'kofi']);
  assert.equal(DONATION_PLATFORMS[0].primary, true);
  assert.equal(DONATION_COPY.en.fundLabel, 'Fund this project');
  assert.equal(DONATION_COPY.en.fundSubline, 'Keep OpenExam Hub free for every learner');
  assert.equal(DONATION_COPY.fr.fundLabel, 'Financer ce projet');
  assert.match(DONATION_COPY.fr.fundSubline, /gratuit/);
  const blob = `${DONATION_COPY.en.fundLabel} ${DONATION_COPY.en.fundSubline} ${DONATION_COPY.fr.fundLabel} ${DONATION_COPY.fr.fundSubline} ${DONATION_COPY.en.fundingHelp}`;
  assert.doesNotMatch(blob, /buy me a coffee|tax-deductible/i);
});

test('example post parses and is clearly a draft', () => {
  assert.equal(example.draft, true);
  assert.equal(example.slug, 'example-when-to-start-preparing');
  assert.ok(example.title.length > 10);
  assert.ok(example.html.includes('<h2'));
  assert.ok(example.headings.length >= 3);
  assert.ok(example.exams.includes('TEF_CANADA'));
  assert.ok(example.exams.includes('IELTS'));
  assert.ok(example.audience.includes('students'));
  assert.ok(example.audience.includes('professionals'));
  assert.ok(example.faq.length >= 1);
  assert.ok(example.sources.every((s) => s.url.startsWith('https://')));
  assert.match(example.html, /example post/i);
});

test('example headings have ids for the table of contents', () => {
  for (const h of example.headings) {
    assert.ok(h.id, 'heading is missing an id');
    assert.ok(h.text, 'heading is missing text');
    assert.ok(example.html.includes(`id="${h.id}"`));
  }
});

test('production mode excludes drafts; preview includes them', () => {
  assert.equal(includeDraftsFromEnv({ VERCEL_ENV: 'production' }), false);
  assert.equal(includeDraftsFromEnv({ VERCEL_ENV: 'preview' }), true);
  assert.equal(includeDraftsFromEnv({}), true);

  const preview = loadBlogPosts({ includeDrafts: true });
  const prod = loadBlogPosts({ includeDrafts: false });
  assert.ok(preview.some((p) => p.slug === example.slug));
  assert.ok(!prod.some((p) => p.slug === example.slug));
});

test('invalid frontmatter is rejected', () => {
  const bad = `---
title: Missing almost everything
description: x
date: "20-11-2026"
updated: "2026-11-20"
lastVerified: "2026-11-20"
exams: [IELTS]
audience: [students]
lang: en
draft: true
sources: []
---

Body.
`;
  assert.throws(() => parsePost('bad-date.md', bad), /YYYY-MM-DD/);
});

test('optional seoTitle is used for the document title only', () => {
  const raw = `---
title: "A long visible title that can stay on the page"
seoTitle: "Short tab title"
description: "A post"
date: "2026-01-01"
updated: "2026-01-01"
lastVerified: "2026-01-01"
exams: [IELTS]
audience: [students]
lang: en
draft: false
sources: []
---

Body text is here.
`;
  const post = parsePost('seo-title-post.md', raw);
  assert.equal(post.title, 'A long visible title that can stay on the page');
  assert.equal(post.seoTitle, 'Short tab title');
  assert.equal(postHeadTitle(post), 'Short tab title · OpenExam Hub');
  assert.equal(articleJsonLd(post).headline, post.title);
  const rss = buildRssXml([post]);
  assert.match(rss, /<title>A long visible title that can stay on the page<\/title>/);
  assert.doesNotMatch(rss, /Short tab title/);

  const without = parsePost('no-seo-title-post.md', raw.replace(/\nseoTitle: "Short tab title"/, ''));
  assert.equal(without.seoTitle, null);
  assert.equal(postHeadTitle(without), `${without.title} · OpenExam Hub`);

  const blank = raw.replace('seoTitle: "Short tab title"', 'seoTitle: ""');
  assert.throws(() => parsePost('blank-seo.md', blank), /seoTitle/);
});

test('unknown exam ids are rejected', () => {
  const raw = `---
title: Hello
description: A post
date: "2026-01-01"
updated: "2026-01-01"
lastVerified: "2026-01-01"
exams: [NOT_AN_EXAM]
audience: [students]
lang: en
draft: false
sources: []
---

# No

Body text is here.
`;
  assert.throws(() => parsePost('hello.md', raw), /NOT_AN_EXAM/);
});

test('TCF_CANADA is a valid blog tag and maps only to the TCF Canada guide', () => {
  assert.ok(BLOG_EXAMS.includes('TCF_CANADA'));
  assert.ok(BLOG_EXAMS.includes('TCF'));
  assert.deepEqual(siteModule.examPagesForTag('TCF_CANADA').map((p) => p.slug), ['tcf-canada']);
  assert.deepEqual(siteModule.examPagesForTag('TCF').map((p) => p.slug), ['tcf']);
  assert.deepEqual(siteModule.EXAM_PAGES.find((p) => p.slug === 'tcf-canada').tags, ['TCF_CANADA']);
  assert.deepEqual(PLAN_PAGES.find((p) => p.guide === 'tcf-canada' && p.slug === 'official-practice-study-path').tags, ['TCF_CANADA']);

  const raw = `---
title: Hello
description: A post
date: "2026-01-01"
updated: "2026-01-01"
lastVerified: "2026-01-01"
exams: [TCF_CANADA]
audience: [immigration]
lang: en
draft: false
sources: []
---

# Yes

Body text is here.
`;
  const post = parsePost('tcf-canada-tag.md', raw);
  assert.deepEqual(post.exams, ['TCF_CANADA']);
  const about = articleJsonLd(post).about;
  assert.equal(about.length, 1);
  assert.equal(about[0].name, 'TCF Canada');
  assert.equal(about[0].url, 'https://openexamhub.org/exams/tcf-canada');

  const posts = loadBlogPosts({ includeDrafts: true });
  const tcfCanada = posts.find((p) => p.slug === 'tcf-canada-clb-nclc-express-entry');
  const nclc7 = posts.find((p) => p.slug === 'nclc-7-clb-7-express-entry-scores');
  assert.ok(tcfCanada && nclc7, 'expected published TCF Canada posts');
  assert.deepEqual(tcfCanada.exams, ['TCF_CANADA']);
  assert.deepEqual(nclc7.exams, ['TEF_CANADA', 'TCF_CANADA']);
  const nclcAbout = articleJsonLd(nclc7).about.map((a) => a.url);
  assert.deepEqual(nclcAbout, [
    'https://openexamhub.org/exams/tef-canada',
    'https://openexamhub.org/exams/tcf-canada'
  ]);
  assert.equal(articleJsonLd(tcfCanada).about[0].url, 'https://openexamhub.org/exams/tcf-canada');
});

test('CELPIP is a valid blog tag and maps only to the CELPIP guide', () => {
  assert.ok(BLOG_EXAMS.includes('CELPIP'));
  assert.deepEqual(siteModule.examPagesForTag('CELPIP').map((p) => p.slug), ['celpip']);
  assert.deepEqual(siteModule.EXAM_PAGES.find((p) => p.slug === 'celpip').tags, ['CELPIP']);
  const posts = loadBlogPosts({ includeDrafts: false });
  const celpip = posts.find((p) => p.slug === 'celpip-to-clb-express-entry');
  assert.ok(celpip, 'expected published CELPIP post');
  assert.deepEqual(celpip.exams, ['CELPIP']);
  assert.equal(articleJsonLd(celpip).about[0].url, 'https://openexamhub.org/exams/celpip');
  assert.equal(articleJsonLd(celpip).about[0].name, 'CELPIP');
});

test('sitemap includes static pages, skips drafts in production, includes posts otherwise', () => {
  const prodXml = buildSitemapXml([]);
  assert.match(prodXml, /https:\/\/openexamhub\.org\/<\/loc>/);
  assert.match(prodXml, /https:\/\/openexamhub\.org\/blog<\/loc>/);
  assert.match(prodXml, /https:\/\/openexamhub\.org\/exams\/celpip<\/loc>/);
  assert.doesNotMatch(prodXml, /example-when-to-start-preparing/);

  const previewXml = buildSitemapXml([example]);
  assert.match(previewXml, /https:\/\/openexamhub\.org\/blog\/example-when-to-start-preparing/);
  assert.doesNotMatch(previewXml, /\/blog\/tag\//, 'tag pages stay out of the sitemap');
  assert.doesNotMatch(previewXml, /<loc>https:\/\/openexamhub\.org\/app<\/loc>/, '/app is a sign-in wall');
  assert.match(previewXml, /<lastmod>2026-11-20<\/lastmod>/);
});

test('RSS lists posts and has a self link', () => {
  const rss = buildRssXml([example]);
  assert.match(rss, /<rss version="2.0"/);
  assert.match(rss, /atom:link href="https:\/\/openexamhub\.org\/blog\/rss\.xml"/);
  assert.match(rss, /example-when-to-start-preparing/);
  assert.match(rss, /<pubDate>/);
});

test('blog index JSON-LD is a CollectionPage with an ItemList of posts', () => {
  const ld = blogIndexJsonLd([example]);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'CollectionPage');
  assert.equal(ld.name, BLOG_INDEX_TITLE);
  assert.equal(ld.description, BLOG_INDEX_DESCRIPTION);
  assert.equal(ld.url, `${SITE_ORIGIN}/blog`);
  assert.equal(ld.isPartOf['@type'], 'Blog');
  assert.equal(ld.isPartOf['@id'], `${SITE_ORIGIN}/blog#blog`);
  assert.equal(ld.mainEntity['@type'], 'ItemList');
  assert.equal(ld.mainEntity.numberOfItems, 1);
  assert.equal(ld.mainEntity.itemListElement[0]['@type'], 'ListItem');
  assert.equal(ld.mainEntity.itemListElement[0].position, 1);
  assert.equal(ld.mainEntity.itemListElement[0].name, example.title);
  assert.equal(ld.mainEntity.itemListElement[0].url, example.canonical);
  assert.equal(blogIndexJsonLd([]).mainEntity.numberOfItems, 0);
});

test('relatedPostsFor prefers curated slugs and only returns published posts', () => {
  const current = { slug: 'ielts-6-5-in-30-days', exams: ['IELTS'], draft: false };
  const cefr = { slug: 'ielts-to-cefr', title: 'IELTS to CEFR', url: '/blog/ielts-to-cefr', exams: ['IELTS'], draft: false, date: '2026-11-27' };
  const clb = { slug: 'ielts-to-clb-express-entry', title: 'IELTS to CLB', url: '/blog/ielts-to-clb-express-entry', exams: ['IELTS'], draft: false, date: '2026-11-26' };
  const draft = { slug: 'ielts-to-cefr', title: 'draft', exams: ['IELTS'], draft: true, date: '2026-11-27' };
  const related = relatedPostsFor(current, [current, cefr, clb, draft]);
  assert.deepEqual(related.map((p) => p.slug), RELATED_POST_SLUGS['ielts-6-5-in-30-days']);
  assert.deepEqual(relatedPostsFor(current, [current, draft]).map((p) => p.slug), []);
});

test('BlogPosting and FAQPage JSON-LD are valid', () => {
  const article = articleJsonLd(example);
  assert.equal(article['@type'], 'BlogPosting');
  assert.equal(article.headline, example.title);
  assert.equal(article.mainEntityOfPage['@id'], `${SITE_ORIGIN}/blog/${example.slug}`);
  assert.equal(article.dateModified, example.updated);
  assert.equal(article.author['@type'], 'Organization');
  assert.equal(article.datePublished, example.date);
  const faq = faqJsonLd(example);
  assert.equal(faq['@type'], 'FAQPage');
  assert.equal(faq.mainEntity[0]['@type'], 'Question');
  assert.ok(faq.mainEntity[0].acceptedAnswer.text);
  assert.equal(faqJsonLd({ faq: [] }), null);
});

test('temporary content dir only loads markdown posts, not the README', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oeh-blog-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# not a post\n');
  fs.writeFileSync(
    path.join(dir, 'a-real-post.md'),
    `---
title: "A real post"
description: "Just a test."
date: "2026-02-02"
updated: "2026-02-02"
lastVerified: "2026-02-02"
exams: [DELE]
audience: [students]
lang: en
draft: false
sources:
  - title: "Instituto Cervantes — DELE"
    url: "https://cervantes.org/es/examenes/dele"
---

## Hello

Body of the post.
`
  );
  const posts = loadBlogPosts({ includeDrafts: false, contentDir: dir });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].slug, 'a-real-post');
  fs.rmSync(dir, { recursive: true, force: true });
});


test('study plan data: routes, sitemap paths and sources stay official and claim-free', () => {
  for (const plan of PLAN_PAGES) {
    const p = planPath(plan);
    assert.match(p, /^\/exams\/[a-z0-9-]+\/[a-z0-9-]+$/);
    assert.ok(siteModule.examPageBySlug(plan.guide), `${p}: unknown parent guide`);
    const meta = siteModule.routeMeta(p);
    assert.equal(meta.canonical, `https://openexamhub.org${p}`);
    assert.equal(siteModule.routeMeta(`${p}/`).canonical, meta.canonical);
    assert.ok(siteModule.indexablePaths().includes(p));
    assert.ok(plan.description.length >= 70 && plan.description.length <= 160, `${p}: description length ${plan.description.length}`);
    assert.match(plan.lastChecked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(plan.faq.length >= 3 && plan.sources.length >= 2);
    const links = [...plan.materials, ...plan.sources, ...plan.phases.flatMap((ph) => ph.tasks.flatMap((t) => t.links))];
    for (const l of links) {
      const host = new URL(l.url).hostname;
      assert.ok(PLAN_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)), `${p}: non-official link ${l.url}`);
    }
    const all = JSON.stringify(plan);
    assert.doesNotMatch(all, /\d+\s?%|pass rate|success rate|guaranteed|we guarantee|students who|testimonial/i, `${p}: stat or promise wording`);
  }
  assert.equal(siteModule.routeMeta('/exams/ielts/not-a-plan'), null);
});


test('indefinite article uses "an" for vowel-sound exam names', () => {
  assert.equal(siteModule.indefiniteArticle('IELTS'), 'an');
  assert.equal(siteModule.indefiniteArticle('ETS'), 'an');
  assert.equal(siteModule.indefiniteArticle('TEF Canada'), 'a');
  assert.equal(siteModule.indefiniteArticle('TCF'), 'a');
  assert.equal(siteModule.indefiniteArticle('TOEFL'), 'a');
  assert.equal(siteModule.indefiniteArticle('CELPIP'), 'a');
  assert.equal(siteModule.indefiniteArticle('Goethe'), 'a');
  assert.equal(siteModule.indefiniteArticle('DELE'), 'a');
  assert.equal(siteModule.indefiniteArticle('telc'), 'a');
  assert.equal(siteModule.indefiniteArticle(''), 'a');
  assert.equal(`Turn this into ${siteModule.indefiniteArticle('IELTS')} IELTS study plan`, 'Turn this into an IELTS study plan');
});


test('TCF Canada links: ?exam=TCF_CANADA or ?exam=TCF&variant=canada', () => {
  assert.deepEqual(parsePlannerQuery('?exam=TCF_CANADA&level=B2'), { exam: 'TCF', level: 'B2' });
  assert.equal(parsePlannerVariant('?exam=TCF_CANADA'), 'canada');
  assert.equal(parsePlannerVariant('?exam=tcf-canada'), 'canada');
  assert.equal(parsePlannerVariant('?exam=TCF&variant=canada'), 'canada');
  assert.equal(parsePlannerVariant('?exam=TCF'), null);
  assert.equal(parsePlannerVariant('?exam=TCF&variant=nope'), null);
  assert.equal(parsePlannerVariant('?exam=IELTS&variant=canada'), null);
  assert.deepEqual(resolvePlannerExam('TCF_CANADA'), { exam: 'TCF', variant: 'canada' });
  assert.deepEqual(resolvePlannerExam('TCF', 'canada'), { exam: 'TCF', variant: 'canada' });
  assert.deepEqual(resolvePlannerExam('TCF'), { exam: 'TCF', variant: 'tout_public' });
  assert.equal(officialProfile('TCF', { variant: 'canada' }).sourceUrl, 'https://www.france-education-international.fr/test/tcf-canada');
  assert.equal(officialProfile('TCF', { variant: 'tout_public' }).sourceUrl, 'https://www.france-education-international.fr/test/tcf-tout-public');
  const mixed = [
    { id: 'tp', title: 'France Éducation international TCF page', url: 'https://www.france-education-international.fr/test/tcf-tout-public' },
    { id: 'rfi', title: 'RFI Français facile', url: 'https://francaisfacile.rfi.fr/fr' },
    { id: 'ca', title: 'Official TCF Canada exam page', url: 'https://www.france-education-international.fr/test/tcf-canada' }
  ];
  assert.ok(resourceVariantScore(mixed[0], 'TCF', 'canada') < resourceVariantScore(mixed[2], 'TCF', 'canada'));
  assert.equal(preferVariantResources(mixed, 'TCF', 'canada')[0].id, 'ca');
  const fixed = withOfficialSource(mixed, 'TCF', 'canada');
  assert.ok(fixed.every((r) => !/tcf-tout-public/.test(r.url)));
  assert.equal(fixed[0].url, 'https://www.france-education-international.fr/test/tcf-canada');
});

test('parsePlannerDays keeps only the planner lengths', () => {
  assert.equal(parsePlannerDays('?exam=TCF&level=B2&days=30'), 30);
  assert.equal(parsePlannerDays('days=14'), 14);
  assert.equal(parsePlannerDays('?days=60'), 60);
  assert.equal(parsePlannerDays('?days=45'), null);
  assert.equal(parsePlannerDays('?days=abc'), null);
  assert.equal(parsePlannerDays(''), null);
});

test('parsePlannerQuery pre-selects known exams and levels, ignores junk', () => {
  assert.deepEqual(parsePlannerQuery('?exam=IELTS'), { exam: 'IELTS', level: null });
  assert.deepEqual(parsePlannerQuery('exam=tef-canada&level=c1'), { exam: 'TEF_CANADA', level: 'C1' });
  assert.deepEqual(parsePlannerQuery('?exam=IELTS&level=B2'), { exam: 'IELTS', level: 'B2' });
  assert.deepEqual(parsePlannerQuery('?exam=not-an-exam&level=Z9'), { exam: null, level: null });
  assert.deepEqual(parsePlannerQuery('?exam=DELF&level=B1'), { exam: null, level: 'B1' }); // known but not in the picker
  assert.deepEqual(parsePlannerQuery(''), { exam: null, level: null });
  assert.equal(parsePlannerQuery('?exam=IELTS').exam || DEFAULT_PICKER_EXAM, 'IELTS');
  assert.equal(parsePlannerQuery('?exam=NOPE').exam || DEFAULT_PICKER_EXAM, DEFAULT_PICKER_EXAM);
});


test('published posts fall back to the first body image as the cover', () => {
  const published = loadBlogPosts({ includeDrafts: false });
  assert.ok(published.length >= 2, 'expected the two published posts');
  for (const post of published) {
    assert.ok(post.cover?.src, `${post.slug} is missing a cover`);
    assert.ok(post.cover.alt, `${post.slug} cover is missing alt`);
    assert.equal(post.cover.imageUrl, `https://openexamhub.org${post.cover.src}`);
    assert.ok(!post.html.includes(`src="${post.cover.src}"`), `${post.slug} still repeats the cover image in the body`);
  }
  const tef = published.find((p) => p.slug === 'tef-canada-clb-nclc-express-entry');
  assert.ok(tef);
  assert.equal(tef.cover.src, '/blog/tef-canada-clb-nclc-express-entry/cover.webp');
  assert.match(tef.cover.credit || '', /OpenExam Hub/);
});

test('frontmatter cover wins over the first body image; invalid cover is rejected', () => {
  const raw = `---
title: "Covered post"
description: "Has an explicit cover."
date: "2026-03-03"
updated: "2026-03-03"
lastVerified: "2026-03-03"
exams: [IELTS]
audience: [students]
lang: en
draft: false
sources: []
cover:
  src: "/blog/covered-post/hero.webp"
  alt: "A custom hero"
  credit: "Photo credit"
---

![A body image](/blog/covered-post/other.webp)

Body text.
`;
  const post = parsePost('covered-post.md', raw);
  assert.equal(post.cover.src, '/blog/covered-post/hero.webp');
  assert.equal(post.cover.alt, 'A custom hero');
  assert.equal(post.cover.credit, 'Photo credit');
  assert.equal(post.cover.imageUrl, 'https://openexamhub.org/blog/covered-post/hero.webp');
  assert.match(post.html, /other\.webp/);
  assert.equal(articleJsonLd(post).image, post.cover.imageUrl);

  const bad = `---
title: "Covered post"
description: "Has a broken cover."
date: "2026-03-03"
updated: "2026-03-03"
lastVerified: "2026-03-03"
exams: [IELTS]
audience: [students]
lang: en
draft: false
sources: []
cover:
  src: "/blog/covered-post/hero.webp"
---

Body text.
`;
  assert.throws(() => parsePost('covered-post.md', bad), /cover/);
});

test('every published post is listed in public/llms.txt and has a unique title and description', () => {
  const llms = fs.readFileSync(path.join(root, 'public/llms.txt'), 'utf8');
  const posts = loadBlogPosts({ includeDrafts: false });
  assert.ok(posts.length > 0);
  for (const p of posts) {
    assert.ok(llms.includes(`](https://openexamhub.org/blog/${p.slug})`), `llms.txt must list /blog/${p.slug}`);
  }
  const drafts = loadBlogPosts({ includeDrafts: true }).filter((p) => p.draft);
  for (const d of drafts) assert.ok(!llms.includes(`/blog/${d.slug}`), `llms.txt must not list the draft /blog/${d.slug}`);
  for (const page of siteModule.EXAM_PAGES) {
    assert.ok(llms.includes(`](https://openexamhub.org/exams/${page.slug})`), `llms.txt must list /exams/${page.slug}`);
  }
  for (const key of ['title', 'description']) {
    const seen = new Map();
    for (const p of posts) {
      const v = String(p[key]).trim().toLowerCase();
      assert.ok(v, `${p.slug}: ${key} is empty`);
      assert.ok(!seen.has(v), `${p.slug} and ${seen.get(v)} share the same ${key}`);
      seen.set(v, p.slug);
    }
  }
  const seenHead = new Map();
  for (const p of posts) {
    const head = postHeadTitle(p);
    assert.ok(head.length <= 60, `${p.slug}: <title> is ${head.length} chars (> 60): ${head}`);
    const key = head.toLowerCase();
    assert.ok(!seenHead.has(key), `${p.slug} and ${seenHead.get(key)} share the same <title>`);
    seenHead.set(key, p.slug);
  }
});

if (process.argv.includes('--built')) {
  const dist = path.join(root, 'dist');
  test('built sitemap and RSS exist', () => {
    assert.ok(fs.existsSync(path.join(dist, 'sitemap.xml')));
    assert.ok(fs.existsSync(path.join(dist, 'blog', 'rss.xml')));
  });

  const drafts = includeDraftsFromEnv();
  if (drafts) {
    test('preview build prerenders the example post with SEO tags and JSON-LD', () => {
      const file = path.join(dist, 'blog/example-when-to-start-preparing/index.html');
      assert.ok(fs.existsSync(file), 'missing prerendered example post');
      const html = fs.readFileSync(file, 'utf8');
      assert.match(html, /<link rel="canonical" href="https:\/\/openexamhub\.org\/blog\/example-when-to-start-preparing"/);
      assert.match(html, /<meta property="og:type" content="article"/);
      assert.match(html, /<meta name="description"/);
      assert.match(html, /application\/ld\+json/);
      assert.match(html, /"@type":"BlogPosting"/);
      assert.match(html, /"@type":"BreadcrumbList"/);
      assert.match(html, /"@type":"FAQPage"/);
      assert.match(html, /href="\/exams\/tef-canada"/);
      assert.match(html, /As of(?:<!-- -->|\s)+20 November 2026/);
      assert.match(html, /id="root"/);
      assert.match(html, /example post/i);
      assert.doesNotMatch(html, /pagead2\.googlesyndication/);
      assert.doesNotMatch(html, /<script type="module"/);
    });
    test('preview build prerenders /blog and tag pages', () => {
      const index = fs.readFileSync(path.join(dist, 'blog/index.html'), 'utf8');
      assert.match(index, /<link rel="canonical" href="https:\/\/openexamhub\.org\/blog"/);
      assert.match(index, /example-when-to-start-preparing/);
      const tag = fs.readFileSync(path.join(dist, 'blog/tag/TEF_CANADA/index.html'), 'utf8');
      assert.match(tag, /TEF Canada/);
    });
  } else {
    test('production build does not prerender draft posts', () => {
      assert.equal(fs.existsSync(path.join(dist, 'blog/example-when-to-start-preparing/index.html')), false);
      const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
      assert.doesNotMatch(sitemap, /example-when-to-start-preparing/);
      for (const pathUrl of ['/', '/about', '/faq', '/funding', '/privacy', '/terms', '/blog']) {
        const loc = pathUrl === '/' ? 'https://openexamhub.org/' : `https://openexamhub.org${pathUrl}`;
        assert.match(sitemap, new RegExp(loc.replace(/[/.]/g, r => '\\' + r)));
      }
      const index = fs.readFileSync(path.join(dist, 'blog/index.html'), 'utf8');
      const rss = fs.readFileSync(path.join(dist, 'blog/rss.xml'), 'utf8');
      assert.doesNotMatch(index, /example-when-to-start-preparing/);
      const published = loadBlogPosts({ includeDrafts: false });
      if (published.length === 0) {
        assert.match(index, /Articles coming soon/);
      } else {
        assert.doesNotMatch(index, /Articles coming soon/);
        for (const post of published) {
          assert.match(index, new RegExp(post.slug));
          assert.ok(fs.existsSync(path.join(dist, 'blog', post.slug, 'index.html')), `missing prerendered ${post.slug}`);
          assert.match(sitemap, new RegExp(post.slug));
          assert.match(rss, new RegExp(post.slug));
          const html = fs.readFileSync(path.join(dist, 'blog', post.slug, 'index.html'), 'utf8');
          assert.match(html, /<meta property="og:type" content="article"/);
          if (post.cover?.imageUrl) {
            assert.match(html, new RegExp(`og:image" content="${post.cover.imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
            assert.match(index, new RegExp(post.cover.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
          }
        }
      }
    });
  }
}

if (process.argv.includes('--built')) {
  const dist = path.join(root, 'dist');
  const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
  const jsonLdBlocks = (html) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const types = (blocks) => blocks.flatMap((b) => (b['@graph'] ? b['@graph'] : [b])).map((b) => b['@type']);
  const visibleText = (html) =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;|&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

  test('TCF, DELF and the TCF B2 plan link to the CLB converter in context', () => {
    const tcf = read('exams/tcf/index.html').split('aria-label="Comparing tests"')[1] || '';
    assert.ok(tcf.includes('href="/tools/clb-converter?tab=tcf"'), 'TCF tout public comparing-tests note deep-links to the converter TCF tab');
    assert.ok(tcf.includes('CLB / NCLC score converter'), 'TCF note uses the converter as anchor text');
    assert.ok(tcf.includes('TCF tout public is not the test IRCC lists for Express Entry'), 'TCF note states the Express Entry list fact');
    assert.ok(tcf.includes('does not convert TCF tout public scores'), 'TCF note says the converter is not for TCF tout public');

    const delf = read('exams/delf/index.html').split('aria-label="Comparing tests"')[1] || '';
    assert.ok(delf.includes('href="/tools/clb-converter"'), 'DELF comparing-tests note links to the CLB converter');
    assert.ok(!delf.includes('?tab='), 'DELF note stays on the default converter URL (TEF and TCF are both named)');
    assert.ok(delf.includes('CLB / NCLC score converter'), 'DELF note uses the converter as anchor text');
    assert.ok(
      delf.includes('not on IRCC') && delf.includes('Express Entry language-test list'),
      'DELF note states that DELF/DALF are not on the Express Entry list'
    );
    assert.ok(
      delf.includes('language-proof page accepts a DELF at B1 or higher') && delf.includes('any DALF result'),
      'DELF note still mentions IRCC citizenship language proof'
    );

    const plan = read('exams/tcf/b2-30-day-study-plan/index.html');
    const marker = 'Convert TCF Canada scores with the';
    const idx = plan.indexOf(marker);
    assert.ok(idx !== -1, 'TCF B2 plan has the converter note');
    const around = plan.slice(idx, idx + 400);
    assert.ok(around.includes('href="/tools/clb-converter?tab=tcf"'), 'TCF B2 plan note deep-links to the converter TCF tab');
    assert.ok(around.includes('CLB / NCLC score converter'), 'TCF B2 plan uses the converter as anchor text');
    assert.ok(plan.includes('does not convert TCF tout public scores'), 'TCF B2 plan says the converter is not for TCF tout public');
  });

  test('exam guides link to the comparison posts they are relevant to', () => {
    const published = new Set(loadBlogPosts({ includeDrafts: false }).map((p) => p.slug));
    const expected = {
      ielts: ['toefl-vs-ielts', 'ielts-to-cefr', 'ielts-to-clb-express-entry'],
      toefl: ['toefl-vs-ielts'],
      delf: ['delf-vs-tcf-which-french-test'],
      tcf: ['delf-vs-tcf-which-french-test'],
      'tcf-canada': ['delf-vs-tcf-which-french-test'],
      'tef-canada': ['delf-vs-tcf-which-french-test']
    };
    for (const [guide, slugs] of Object.entries(expected)) {
      const html = read(`exams/${guide}/index.html`);
      const main = html.split('aria-label="Comparing tests"')[1] || '';
      for (const slug of slugs) {
        if (!published.has(slug)) continue;
        assert.ok(main.includes(`href="/blog/${slug}"`), `/exams/${guide} links to /blog/${slug} from the comparison note`);
        assert.ok(html.includes(`href="/blog/${slug}"`), `/exams/${guide} lists /blog/${slug}`);
      }
    }
  });

  test('built sitemap lists every published post and no draft', () => {
    const sitemap = read('sitemap.xml');
    for (const p of loadBlogPosts({ includeDrafts: false })) assert.ok(sitemap.includes(`<loc>https://openexamhub.org/blog/${p.slug}</loc>`), `sitemap lists ${p.slug}`);
    // Local and preview builds include drafts on purpose; only a production build must omit them.
    if (!includeDraftsFromEnv()) for (const d of loadBlogPosts({ includeDrafts: true }).filter((p) => p.draft)) assert.ok(!sitemap.includes(`/blog/${d.slug}<`), `sitemap omits draft ${d.slug}`);
  });

  test('published post <title>s are at most 60 characters; H1, RSS and headline keep the full title', () => {
    const rss = read('blog/rss.xml');
    const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const decode = (s) =>
      s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    for (const post of loadBlogPosts({ includeDrafts: false })) {
      const html = read(`blog/${post.slug}/index.html`);
      const rawTitle = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
      assert.ok(rawTitle, `missing <title> on ${post.slug}`);
      const title = decode(rawTitle).replace(/\s+/g, ' ').trim();
      assert.equal(title, postHeadTitle(post), `<title> on ${post.slug}`);
      assert.ok(title.length <= 60, `${post.slug}: <title> is ${title.length} chars (> 60): ${title}`);
      assert.match(html, new RegExp(`<meta property="og:title" content="${escape(rawTitle)}"`));
      assert.match(html, new RegExp(`<meta name="twitter:title" content="${escape(rawTitle)}"`));
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      assert.ok(h1, `missing h1 on ${post.slug}`);
      const h1text = decode(h1[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      assert.equal(h1text, post.title, `H1 on ${post.slug} must keep the visible title`);
      const article = jsonLdBlocks(html)
        .flatMap((b) => (b['@graph'] ? b['@graph'] : [b]))
        .find((b) => b['@type'] === 'BlogPosting');
      assert.ok(article, `${post.slug} missing BlogPosting JSON-LD`);
      assert.equal(article.headline, post.title, `headline on ${post.slug}`);
      assert.ok(article.headline.length <= 110, `${post.slug}: headline is ${article.headline.length} chars`);
      const rssTitle = post.title
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      assert.ok(rss.includes(`<title>${rssTitle}</title>`), `RSS keeps the visible title for ${post.slug}`);
    }
  });

  test('exam guide pages are prerendered as static HTML with their own head and JSON-LD', () => {
    const { EXAM_PAGES } = siteModule;
    const sitemap = read('sitemap.xml');
    for (const page of EXAM_PAGES) {
      const rel = `exams/${page.slug}/index.html`;
      assert.ok(fs.existsSync(path.join(dist, rel)), `missing ${rel}`);
      const html = read(rel);
      const url = `https://openexamhub.org/exams/${page.slug}`;
      assert.match(html, new RegExp(`<link rel="canonical" href="${url}"`));
      assert.match(html, new RegExp(`<meta property="og:url" content="${url}"`));
      assert.ok(html.includes(`<title>${page.title.replace(/&/g, '&amp;')} · OpenExam Hub</title>`), `title on ${page.slug}`);
      assert.match(html, /<h1[^>]*>/);
      assert.doesNotMatch(html, /<script type="module"/);
      assert.doesNotMatch(html, /pagead2\.googlesyndication|adsbygoogle/);
      const t = types(jsonLdBlocks(html));
      for (const need of ['Organization', 'WebSite', 'BreadcrumbList', 'WebPage', 'FAQPage']) {
        assert.ok(t.includes(need), `${page.slug} missing ${need} JSON-LD`);
      }
      assert.ok(sitemap.includes(`<loc>${url}</loc>`), `sitemap missing ${url}`);
    }
    assert.ok(fs.existsSync(path.join(dist, 'exams/index.html')));
    assert.ok(sitemap.includes('<loc>https://openexamhub.org/exams</loc>'));
  });


  test('exam guide planner CTAs use "an" before vowel-sound names', () => {
    const ielts = read('exams/ielts/index.html');
    assert.ok(ielts.includes('Turn this into an IELTS study plan'), 'IELTS CTA uses "an IELTS"');
    assert.ok(!ielts.includes('Turn this into a IELTS'), 'IELTS CTA must not say "a IELTS"');
    assert.ok(read('exams/tef-canada/index.html').includes('Turn this into a TEF Canada study plan'));
    assert.ok(read('exams/celpip/index.html').includes('Turn this into a CELPIP study plan'));
    assert.ok(read('exams/toefl/index.html').includes('Turn this into a TOEFL study plan'));
  });


  test('study plan pages are prerendered, linked from their guide, in the sitemap, with visible FAQ JSON-LD', () => {
    const sitemap = read('sitemap.xml');
    assert.equal(PLAN_PAGES.length, 5);
    for (const plan of PLAN_PAGES) {
      const p = planPath(plan);
      const rel = `${p.slice(1)}/index.html`;
      assert.ok(fs.existsSync(path.join(dist, rel)), `missing ${rel}`);
      const html = read(rel);
      const url = `https://openexamhub.org${p}`;
      assert.match(html, new RegExp(`<link rel="canonical" href="${url}"`));
      assert.match(html, new RegExp(`<meta property="og:url" content="${url}"`));
      assert.match(html, /<meta property="og:title"/);
      assert.ok(html.includes(`<title>${plan.title.replace(/&/g, '&amp;')} · OpenExam Hub</title>`), `title on ${p}`);
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${p} has one h1`);
      assert.doesNotMatch(html, /<script type="module"/);
      assert.doesNotMatch(html, /pagead2\.googlesyndication|adsbygoogle/);
      assert.match(html, /Last checked/);
      assert.match(html, /id="sources-title"/);
      const blocks = jsonLdBlocks(html);
      const t = types(blocks);
      for (const need of ['Organization', 'WebSite', 'BreadcrumbList', 'WebPage', 'Course', 'FAQPage']) {
        assert.ok(t.includes(need), `${p} missing ${need} JSON-LD`);
      }
      const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList').itemListElement;
      assert.deepEqual(crumbs.map((c) => c.item), [
        'https://openexamhub.org/', 'https://openexamhub.org/exams', `https://openexamhub.org/exams/${plan.guide}`, url
      ]);
      const faq = blocks.find((b) => b['@type'] === 'FAQPage');
      assert.equal(faq.mainEntity.length, plan.faq.length);
      const text = html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      for (const item of plan.faq) {
        assert.ok(text.includes(`>${item.q}`), `${p}: FAQ question not visible: ${item.q}`);
        assert.ok(text.includes(item.a), `${p}: FAQ answer not visible: ${item.q}`);
      }
      assert.ok(sitemap.includes(`<loc>${url}</loc>`), `sitemap missing ${url}`);
      const guide = read(`exams/${plan.guide}/index.html`);
      assert.ok(guide.includes(`href="${p}"`), `guide /exams/${plan.guide} does not link to ${p}`);
      assert.ok(html.includes(`href="/exams/${plan.guide}"`), `${p} does not link back to its guide`);
    }
  });

  test('TCF Canada posts appear on the TCF Canada guide and plan, not on TCF tout public', () => {
    const postHrefs = [
      '/blog/tcf-canada-clb-nclc-express-entry',
      '/blog/nclc-7-clb-7-express-entry-scores'
    ];
    const tcfCanadaGuide = read('exams/tcf-canada/index.html');
    const tcfCanadaPlan = read('exams/tcf-canada/official-practice-study-path/index.html');
    const tcfGuide = read('exams/tcf/index.html');
    const tcfPlan = read('exams/tcf/b2-30-day-study-plan/index.html');
    for (const href of postHrefs) {
      assert.ok(tcfCanadaGuide.includes(`href="${href}"`), `TCF Canada guide missing ${href}`);
      assert.ok(tcfCanadaPlan.includes(`href="${href}"`), `TCF Canada plan missing ${href}`);
      assert.ok(!tcfGuide.includes(`href="${href}"`), `TCF tout public should not list ${href}`);
      assert.ok(!tcfPlan.includes(`href="${href}"`), `TCF B2 plan should not list ${href}`);
    }

    const tefGuide = read('exams/tef-canada/index.html');
    assert.ok(tefGuide.includes('href="/blog/nclc-7-clb-7-express-entry-scores"'), 'TEF Canada guide should still list the NCLC 7 post');
    assert.ok(tefGuide.includes('href="/blog/tef-canada-clb-nclc-express-entry"'), 'TEF Canada guide should still list the TEF conversion post');
    assert.ok(!tefGuide.includes('href="/blog/tcf-canada-clb-nclc-express-entry"'), 'TEF Canada guide should not list the TCF-only conversion post');

    const ielts = read('exams/ielts/index.html');
    assert.ok(ielts.includes('href="/blog/ielts-fees-registration-2027-test-dates"'));
    assert.ok(ielts.includes('href="/blog/ielts-6-5-in-30-days"'));
    const goethe = read('exams/goethe/index.html');
    assert.ok(goethe.includes('href="/blog/german-exams-visa-university-professional-recognition"'));

    const chipHrefs = (html) => {
      const m = html.match(/Exam(?: <!-- -->)?guides?(?:<!-- -->)?:<\/span>([\s\S]*?)<\/p>/);
      assert.ok(m, 'missing Exam guide chip');
      return [...m[1].matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
    };
    const aboutUrls = (html) => {
      const article = jsonLdBlocks(html)
        .flatMap((b) => (b['@graph'] ? b['@graph'] : [b]))
        .find((b) => b['@type'] === 'BlogPosting');
      assert.ok(article?.about, 'missing BlogPosting about');
      return (Array.isArray(article.about) ? article.about : [article.about]).map((a) => a.url);
    };

    const tcfPost = read('blog/tcf-canada-clb-nclc-express-entry/index.html');
    assert.deepEqual(chipHrefs(tcfPost), ['/exams/tcf-canada']);
    assert.deepEqual(aboutUrls(tcfPost), ['https://openexamhub.org/exams/tcf-canada']);

    const nclcPost = read('blog/nclc-7-clb-7-express-entry-scores/index.html');
    assert.deepEqual(chipHrefs(nclcPost), ['/exams/tef-canada', '/exams/tcf-canada']);
    assert.deepEqual(aboutUrls(nclcPost), [
      'https://openexamhub.org/exams/tef-canada',
      'https://openexamhub.org/exams/tcf-canada'
    ]);

    const celpipPost = read('blog/celpip-to-clb-express-entry/index.html');
    assert.deepEqual(chipHrefs(celpipPost), ['/exams/celpip']);
    assert.deepEqual(aboutUrls(celpipPost), ['https://openexamhub.org/exams/celpip']);
    const celpipGuide = read('exams/celpip/index.html');
    assert.ok(celpipGuide.includes('href="/blog/celpip-to-clb-express-entry"'), 'CELPIP guide From the blog lists the CELPIP post');
    const ieltsCompare = read('exams/ielts/index.html').split('aria-label="Comparing tests"')[1] || '';
    assert.ok(ieltsCompare.includes('href="/exams/celpip"'), 'IELTS comparing-tests note links to /exams/celpip');
  });

  test('info pages are prerendered with their own title and canonical; FAQ has FAQPage JSON-LD', () => {
    for (const p of ['/about', '/faq', '/funding', '/privacy', '/terms']) {
      const html = read(`${p.slice(1)}/index.html`);
      assert.match(html, new RegExp(`<link rel="canonical" href="https://openexamhub\\.org${p}"`));
      assert.doesNotMatch(html, /<div id="root"><\/div>/, `${p} body should be prerendered`);
      assert.match(html, /<script type="module"/, `${p} keeps the app script`);
      assert.ok(types(jsonLdBlocks(html)).includes('BreadcrumbList'));
    }
    const faqHtml = read('faq/index.html');
    const faq = jsonLdBlocks(faqHtml).find((b) => b['@type'] === 'FAQPage');
    assert.ok(faq && faq.mainEntity.length >= 5);
    assert.equal(faq.mainEntity.length, FAQ.length);
    const faqTypes = types(jsonLdBlocks(faqHtml));
    assert.equal(faqTypes.filter((t) => t === 'FAQPage').length, 1, '/faq must not duplicate FAQPage');
    assert.ok(!faqTypes.includes('HowTo'), '/faq must not use retired HowTo markup');
    const faqText = visibleText(faqHtml);
    const squash = (s) => s.replace(/\s+/g, ' ').trim();
    faq.mainEntity.forEach((q, i) => {
      assert.equal(q.name, FAQ[i].q);
      assert.equal(q.acceptedAnswer.text, FAQ[i].a);
      assert.ok(squash(faqText).includes(squash(q.name)), `FAQ question visible: ${q.name}`);
      assert.ok(squash(faqText).includes(squash(q.acceptedAnswer.text)), `FAQ answer visible: ${q.name}`);
    });
    const app = read('app/index.html');
    assert.match(app, /<link rel="canonical" href="https:\/\/openexamhub\.org\/app"/);
    assert.match(app, /<title>Study planner · OpenExam Hub<\/title>/);
  });

  test('built sitemap lists every indexable page and post, and nothing else (never the 7-URL stub)', () => {
    assert.equal(fs.existsSync(path.join(root, 'public', 'sitemap.xml')), false, 'public/sitemap.xml would shadow nothing but drift; the build writes dist/sitemap.xml');
    const sitemap = read('sitemap.xml');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const posts = loadBlogPosts({ includeDrafts: includeDraftsFromEnv() });
    const expected = [...SITEMAP_PATHS.map((p) => `https://openexamhub.org${p === '/' ? '/' : p}`), ...posts.map((p) => p.canonical)];
    assert.deepEqual([...locs].sort(), [...expected].sort());
    assert.equal(new Set(locs).size, locs.length, 'no duplicate URLs');
    assert.ok(locs.length >= 20, `sitemap has only ${locs.length} URLs`);
    assert.ok(!locs.includes('https://openexamhub.org/app'), '/app is a sign-in wall');
    assert.ok(!locs.some((u) => u.includes('/blog/tag/')), 'tag pages stay out of the sitemap');
  });

  test('blog tag pages with fewer than 3 posts are noindex,follow', () => {
    const posts = loadBlogPosts({ includeDrafts: includeDraftsFromEnv() });
    for (const tag of allExamTags(posts)) {
      const html = read(`blog/tag/${tag}/index.html`);
      const count = posts.filter((p) => p.exams.includes(tag)).length;
      const noindex = /<meta name="robots" content="noindex,follow" \/>/.test(html);
      assert.equal(noindex, count < TAG_INDEX_MIN_POSTS, `${tag}: ${count} post(s), noindex=${noindex}`);
    }
  });


  test('blog index has CollectionPage and ItemList JSON-LD matching the visible posts', () => {
    const html = read('blog/index.html');
    const blocks = jsonLdBlocks(html);
    const t = types(blocks);
    assert.ok(t.includes('CollectionPage'), '/blog missing CollectionPage JSON-LD');
    assert.ok(t.includes('BreadcrumbList'), '/blog missing BreadcrumbList JSON-LD');
    assert.ok(!t.includes('HowTo'), '/blog must not use retired HowTo markup');
    assert.equal(t.filter((x) => x === 'CollectionPage').length, 1);
    const page = blocks.find((b) => b['@type'] === 'CollectionPage');
    assert.ok(page?.mainEntity, '/blog CollectionPage missing mainEntity ItemList');
    assert.equal(page.url, 'https://openexamhub.org/blog');
    assert.equal(page.name, BLOG_INDEX_TITLE);
    assert.equal(page.description, BLOG_INDEX_DESCRIPTION);
    assert.equal(page.isPartOf['@type'], 'Blog');
    assert.equal(page.isPartOf['@id'], 'https://openexamhub.org/blog#blog');
    const list = page.mainEntity;
    assert.equal(list['@type'], 'ItemList');
    const published = loadBlogPosts({ includeDrafts: includeDraftsFromEnv() });
    assert.equal(list.numberOfItems, published.length);
    assert.deepEqual(
      list.itemListElement.map((item) => ({ position: item.position, name: item.name, url: item.url })),
      published.map((post, i) => ({ position: i + 1, name: post.title, url: post.canonical }))
    );
    const text = visibleText(html);
    for (const post of published) {
      assert.ok(html.includes(`href="${post.url}"`), `/blog lists ${post.slug}`);
      assert.ok(text.includes(post.title), `/blog shows title for ${post.slug}`);
    }
  });

  test('the four comparison posts keep one BlogPosting, BreadcrumbList and FAQPage each', () => {
    const slugs = [
      'delf-vs-tcf-which-french-test',
      'toefl-vs-ielts',
      'ielts-to-clb-express-entry',
      'ielts-to-cefr'
    ];
    const published = new Map(loadBlogPosts({ includeDrafts: false }).map((p) => [p.slug, p]));
    const squash = (s) => s.replace(/\s+/g, ' ').trim();
    for (const slug of slugs) {
      const post = published.get(slug);
      assert.ok(post, `missing published post ${slug}`);
      const html = read(`blog/${slug}/index.html`);
      const blocks = jsonLdBlocks(html);
      const t = types(blocks);
      assert.ok(!t.includes('HowTo'), `${slug} must not use retired HowTo markup`);
      assert.equal(t.filter((x) => x === 'BlogPosting').length, 1, `${slug} should have exactly one BlogPosting`);
      assert.equal(t.filter((x) => x === 'BreadcrumbList').length, 1, `${slug} should have exactly one BreadcrumbList`);
      assert.equal(t.filter((x) => x === 'FAQPage').length, 1, `${slug} should have exactly one FAQPage`);
      const article = blocks.find((b) => b['@type'] === 'BlogPosting');
      assert.equal(article.headline, post.title);
      assert.equal(article.url, post.canonical);
      const faq = blocks.find((b) => b['@type'] === 'FAQPage');
      assert.ok(post.faq?.length, `${slug} frontmatter should include visible FAQ`);
      assert.equal(faq.mainEntity.length, post.faq.length);
      const text = visibleText(html);
      faq.mainEntity.forEach((q, i) => {
        assert.equal(q.name, post.faq[i].q);
        assert.equal(q.acceptedAnswer.text, post.faq[i].a);
        assert.ok(squash(text).includes(squash(q.name)), `${slug} FAQ question visible: ${q.name}`);
        assert.ok(squash(text).includes(squash(q.acceptedAnswer.text)), `${slug} FAQ answer visible: ${q.name}`);
      });
    }
  });

  test('unindexed pages gain new in-content inbound links from already-published pages', () => {
    const published = new Set(loadBlogPosts({ includeDrafts: false }).map((p) => p.slug));
    const href = (slug) => `href="/blog/${slug}"`;

    const ieltsPlan = read('exams/ielts/8-week-study-plan/index.html');
    if (published.has('ielts-to-cefr')) {
      assert.ok(ieltsPlan.includes(href('ielts-to-cefr')), 'IELTS 8-week plan links to ielts-to-cefr');
    }
    if (published.has('ielts-to-clb-express-entry')) {
      assert.ok(ieltsPlan.includes(href('ielts-to-clb-express-entry')), 'IELTS 8-week plan links to ielts-to-clb');
    }
    const tcfPlan = read('exams/tcf/b2-30-day-study-plan/index.html');
    if (published.has('delf-vs-tcf-which-french-test')) {
      assert.ok(tcfPlan.includes(href('delf-vs-tcf-which-french-test')), 'TCF B2 plan links to delf-vs-tcf');
    }

    const pairs = [
      ['ielts-6-5-in-30-days', 'ielts-to-cefr'],
      ['ielts-6-5-in-30-days', 'ielts-to-clb-express-entry'],
      ['ielts-for-express-entry-academic-or-general', 'ielts-to-clb-express-entry'],
      ['ielts-for-express-entry-academic-or-general', 'toefl-vs-ielts'],
      ['ielts-fees-registration-2027-test-dates', 'toefl-vs-ielts'],
      ['ielts-fees-registration-2027-test-dates', 'ielts-to-cefr'],
      ['tef-canada-vs-tcf-canada', 'delf-vs-tcf-which-french-test'],
      ['tcf-canada-clb-nclc-express-entry', 'delf-vs-tcf-which-french-test']
    ];
    for (const [from, to] of pairs) {
      if (!published.has(from) || !published.has(to)) continue;
      const html = read(`blog/${from}/index.html`);
      const related = html.split('id="related-posts-title"')[1] || '';
      assert.ok(related.includes(href(to)), `/blog/${from} related reading links to /blog/${to}`);
    }

    const about = read('about/index.html');
    assert.ok(about.includes('href="/faq"') && about.includes('More to read'), '/about links to /faq in content');
    assert.ok(about.includes('href="/blog"'), '/about links to /blog in content');
    const funding = read('funding/index.html');
    assert.ok(funding.includes('href="/faq"'), '/funding links to /faq in content');
    assert.ok(funding.includes('href="/blog"'), '/funding links to /blog in content');

    const sitemap = read('sitemap.xml');
    for (const loc of [
      'https://openexamhub.org/faq',
      'https://openexamhub.org/blog',
      'https://openexamhub.org/blog/delf-vs-tcf-which-french-test',
      'https://openexamhub.org/blog/toefl-vs-ielts',
      'https://openexamhub.org/blog/ielts-to-clb-express-entry',
      'https://openexamhub.org/blog/ielts-to-cefr'
    ]) {
      assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);
    }
  });

  test('funding page and site footer include the PayPal funding link', () => {
    const funding = read('funding/index.html');
    assert.ok(funding.includes(`href="${PAYPAL_URL}"`), 'funding page missing PayPal href');
    assert.match(funding, /Fund this project/);
    assert.match(funding, /Keep OpenExam Hub free for every learner/);
    assert.match(funding, /target="_blank"/);
    assert.match(funding, /rel="noopener noreferrer"/);
    assert.doesNotMatch(funding, /Buy me a coffee/i);
    assert.doesNotMatch(funding, /tax-deductible/i);
    assert.doesNotMatch(funding, /github\.com\/sponsors/);
    assert.doesNotMatch(funding, /opencollective\.com/);
    assert.match(funding, /ko-fi\.com\/openexamhub/);
    const home = read('index.html');
    assert.ok(home.includes(`href="${PAYPAL_URL}"`), 'homepage footer missing PayPal href');
    assert.match(home, /Fund this project/);
    assert.match(home, /Keep OpenExam Hub free for every learner/);
    assert.doesNotMatch(home, /github\.com\/sponsors/);
    assert.doesNotMatch(home, /opencollective\.com/);
  });

  test('homepage is prerendered with hero, exam guide links and FAQ, and keeps its head', () => {
    const html = read('index.html');
    assert.match(html, /<div id="root" data-prerendered="landing">/);
    assert.match(html, /<h1[^>]*>Prepare for your language exam/);
    for (const page of siteModule.EXAM_PAGES) assert.ok(html.includes(`href="/exams/${page.slug}"`), `homepage links /exams/${page.slug}`);
    assert.match(html, /id="common-questions"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/openexamhub\.org\/"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/openexamhub\.org\/"/);
    assert.match(html, /<script type="module"/);
    assert.doesNotMatch(html, /pagead2\.googlesyndication|adsbygoogle/);
    assert.ok(types(jsonLdBlocks(html)).includes('WebSite'));
    assert.match(read('app/index.html'), /<div id="root"><\/div>/, '/app shell stays empty');
  });

  test('every prerendered JSON-LD block parses', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === 'index.html' ? [path.join(dir, e.name)] : []);
    for (const file of walk(dist)) {
      const blocks = jsonLdBlocks(fs.readFileSync(file, 'utf8'));
      assert.ok(blocks.length >= 1, `no JSON-LD in ${file}`);
    }
  });
}

if (failed) {
  console.error(`\n${failed} blog test(s) failed`);
  process.exit(1);
}
console.log('\nAll blog tests passed.');

{
  const { isPlannerDeepLink } = await import('../lib/exams.js');
  const assert = (await import('node:assert/strict')).default;
  assert.equal(isPlannerDeepLink('?exam=TCF_CANADA&level=B2&days=30'), true);
  assert.equal(isPlannerDeepLink('?exam=IELTS&band=6.5&days=14'), true);
  assert.equal(isPlannerDeepLink('?exam=IELTS&level=C1'), false);
  assert.equal(isPlannerDeepLink('?exam=TEF_CANADA&level=B2&days=45'), false);
  assert.equal(isPlannerDeepLink('?exam=NOPE&level=B2&days=30'), false);
  console.log('isPlannerDeepLink ok');
}
