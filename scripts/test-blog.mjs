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
  SITE_ORIGIN,
  CONTENT_DIR
} from './blog-data.mjs';

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
  assert.match(previewXml, /https:\/\/openexamhub\.org\/blog\/tag\/TEF_CANADA/);
  assert.match(previewXml, /https:\/\/openexamhub\.org\/blog\/tag\/IELTS/);
  assert.match(previewXml, /<lastmod>2026-11-20<\/lastmod>/);
});

test('RSS lists posts and has a self link', () => {
  const rss = buildRssXml([example]);
  assert.match(rss, /<rss version="2.0"/);
  assert.match(rss, /atom:link href="https:\/\/openexamhub\.org\/blog\/rss\.xml"/);
  assert.match(rss, /example-when-to-start-preparing/);
  assert.match(rss, /<pubDate>/);
});

test('Article and FAQPage JSON-LD are valid', () => {
  const article = articleJsonLd(example);
  assert.equal(article['@type'], 'Article');
  assert.equal(article.headline, example.title);
  assert.equal(article.mainEntityOfPage, `${SITE_ORIGIN}/blog/${example.slug}`);
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
      assert.match(html, /"@type":"Article"/);
      assert.match(html, /"@type":"FAQPage"/);
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
    });
  }
}

if (failed) {
  console.error(`\n${failed} blog test(s) failed`);
  process.exit(1);
}
console.log('\nAll blog tests passed.');
