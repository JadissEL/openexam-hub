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
  faqJsonLd,
  normalizeCover,
  firstBodyImage,
  resolveImageUrl,
  SITE_ORIGIN,
  CONTENT_DIR
} from './blog-data.mjs';
import { SITEMAP_PATHS, TAG_INDEX_MIN_POSTS, allExamTags } from './blog-data.mjs';
import { parsePlannerQuery, parsePlannerDays, parsePlannerVariant, DEFAULT_PICKER_EXAM } from '../lib/exams.js';
import * as siteModule from '../src/seo/site.js';
import { PLAN_PAGES, planPath } from '../src/seo/planPages.js';
import { DONATION_COPY, DONATION_LINKS, DONATION_PLATFORMS } from '../src/donations.js';

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

test('sitemap includes static pages, skips drafts in production, includes posts otherwise', () => {
  const prodXml = buildSitemapXml([]);
  assert.match(prodXml, /https:\/\/openexamhub\.org\/<\/loc>/);
  assert.match(prodXml, /https:\/\/openexamhub\.org\/blog<\/loc>/);
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

test('TCF Canada links: ?exam=TCF_CANADA or ?exam=TCF&variant=canada', () => {
  assert.deepEqual(parsePlannerQuery('?exam=TCF_CANADA&level=B2'), { exam: 'TCF', level: 'B2' });
  assert.equal(parsePlannerVariant('?exam=TCF_CANADA'), 'canada');
  assert.equal(parsePlannerVariant('?exam=tcf-canada'), 'canada');
  assert.equal(parsePlannerVariant('?exam=TCF&variant=canada'), 'canada');
  assert.equal(parsePlannerVariant('?exam=TCF'), null);
  assert.equal(parsePlannerVariant('?exam=TCF&variant=nope'), null);
  assert.equal(parsePlannerVariant('?exam=IELTS&variant=canada'), null);
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

  test('info pages are prerendered with their own title and canonical; FAQ has FAQPage JSON-LD', () => {
    for (const p of ['/about', '/faq', '/funding', '/privacy', '/terms']) {
      const html = read(`${p.slice(1)}/index.html`);
      assert.match(html, new RegExp(`<link rel="canonical" href="https://openexamhub\\.org${p}"`));
      assert.doesNotMatch(html, /<div id="root"><\/div>/, `${p} body should be prerendered`);
      assert.match(html, /<script type="module"/, `${p} keeps the app script`);
      assert.ok(types(jsonLdBlocks(html)).includes('BreadcrumbList'));
    }
    const faq = jsonLdBlocks(read('faq/index.html')).find((b) => b['@type'] === 'FAQPage');
    assert.ok(faq && faq.mainEntity.length >= 5);
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
