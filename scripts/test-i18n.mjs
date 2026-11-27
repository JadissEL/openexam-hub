/**
 * Locale catalogs must match the English source: same keys, same number tokens,
 * same https URLs, same {placeholders}. A stale or partial locale is not published.
 *
 *   node scripts/test-i18n.mjs
 *   node scripts/test-i18n.mjs --built
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unitIds, getEnglishUnit } from '../src/i18n/units.js';
import { numberTokens, placeholders, translatableEntries, unitFresh, urlTokens } from '../src/i18n/overlay.js';
import { messageHash, messagesFresh, registerCatalog, translate } from '../src/i18n/runtime.js';
import { blogEntries, blogSourceHashFrom } from '../src/i18n/blogText.js';
import { ENABLED_LOCALES, localeMeta } from '../src/i18n/locales.js';
import { alternatesFor, isPagePublished, publishedLocales } from '../src/i18n/publish.js';
import { localizePath } from '../src/i18n/paths.js';
import { indexablePaths, SITE_ORIGIN } from '../src/seo/site.js';
import { CONTENT_DIR, REPO_ROOT, includeDraftsFromEnv, loadBlogPosts } from './blog-data.mjs';
import { loadCatalog } from './load-catalog.mjs';
import enMessages from '../src/i18n/messages/en.json' with { type: 'json' };

const built = process.argv.includes('--built');
const root = REPO_ROOT;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n${err.stack || err.message}`);
  }
}

function bag(tokens) {
  const map = new Map();
  for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
  return map;
}

function sameBag(a, b) {
  const left = bag(a);
  const right = bag(b);
  if (left.size !== right.size) return false;
  for (const [key, count] of left) if (right.get(key) !== count) return false;
  return true;
}

function englishBlog() {
  const out = [];
  for (const post of loadBlogPosts({ includeDrafts: true })) {
    if (post.draft) continue;
    const raw = fs.readFileSync(path.join(CONTENT_DIR, `${post.slug}.md`), 'utf8');
    const parsed = matter(raw);
    const body = String(parsed.content || '').trim();
    out.push({ slug: post.slug, data: parsed.data || {}, body, hash: blogSourceHashFrom(parsed.data || {}, body) });
  }
  return out;
}

const posts = englishBlog();
const hashFile = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/blog-hashes.json'), 'utf8'));

test('blog-hashes.json matches the English posts', () => {
  const expected = Object.fromEntries(posts.map((post) => [post.slug, post.hash]));
  assert.deepEqual(hashFile, expected);
});

test('English messages have no _sourceHash of their own', () => {
  assert.equal(enMessages._sourceHash, undefined);
  assert.equal(typeof messageHash(enMessages), 'string');
});

for (const locale of ENABLED_LOCALES) {
  const catalog = loadCatalog(locale);
  test(`${locale} catalog is present`, () => {
    assert.ok(catalog, `missing src/i18n/messages/${locale}.json`);
    registerCatalog(locale, catalog);
    assert.equal(messagesFresh(locale), true, 'message keys, placeholders or _sourceHash drifted from English');
  });
  if (!catalog) continue;
  registerCatalog(locale, catalog);

  test(`${locale} content units are fresh and keep numbers, URLs and placeholders`, () => {
    const problems = [];
    for (const id of unitIds()) {
      const english = getEnglishUnit(id);
      const overlay = catalog.units[id];
      if (!unitFresh(english, overlay)) {
        problems.push(`${id} missing or stale`);
        continue;
      }
      for (const entry of translatableEntries(english)) {
        const translated = overlay.strings[entry.path];
        if (!sameBag(numberTokens(entry.text), numberTokens(translated))) problems.push(`${id} ${entry.path} numbers`);
        if (!sameBag(urlTokens(entry.text), urlTokens(translated))) problems.push(`${id} ${entry.path} urls`);
        if (placeholders(entry.text).join(',') !== placeholders(translated).join(',')) problems.push(`${id} ${entry.path} placeholders`);
        if (translated.trim() === entry.text.trim() && entry.text.trim().length > 40 && /[a-z]/i.test(entry.text)) {
          problems.push(`${id} ${entry.path} still English`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });

  test(`${locale} blog posts are fresh`, () => {
    const problems = [];
    for (const post of posts) {
      const file = path.join(root, 'content/blog/i18n', locale, `${post.slug}.md`);
      if (!fs.existsSync(file)) {
        problems.push(`${post.slug} missing`);
        continue;
      }
      const parsed = matter(fs.readFileSync(file, 'utf8'));
      const data = parsed.data || {};
      const body = String(parsed.content || '').trim();
      if (data.translationOf !== post.slug || data.sourceHash !== post.hash || data.lang !== locale) {
        problems.push(`${post.slug} frontmatter`);
        continue;
      }
      const translated = blogEntries(data, body);
      const source = blogEntries(post.data, post.body);
      if (translated.length !== source.length) problems.push(`${post.slug} field count ${translated.length}!=${source.length}`);
      for (let i = 0; i < source.length; i++) {
        const from = source[i];
        const to = translated.find((entry) => entry.path === from.path);
        if (!to) {
          problems.push(`${post.slug} missing ${from.path}`);
          continue;
        }
        if (!sameBag(numberTokens(from.text), numberTokens(to.text))) problems.push(`${post.slug} ${from.path} numbers`);
        if (!sameBag(urlTokens(from.text), urlTokens(to.text))) problems.push(`${post.slug} ${from.path} urls`);
      }
      if (!isPagePublished(locale, `/blog/${post.slug}`)) problems.push(`${post.slug} not published`);
    }
    assert.deepEqual(problems, []);
  });

  test(`${locale} publishes every public page`, () => {
    const skipped = [];
    for (const page of indexablePaths()) {
      if (page === '/app' || page === '/privacy' || page === '/terms') continue;
      if (!isPagePublished(locale, page)) skipped.push(page);
    }
    if (!isPagePublished(locale, '/blog')) skipped.push('/blog');
    assert.deepEqual(skipped, []);
  });
}

if (built) {
  const dist = path.join(root, 'dist');
  test('built locale pages match the sitemap and hreflang set', () => {
    const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const visiblePosts = loadBlogPosts({ includeDrafts: includeDraftsFromEnv() });
    const pages = [...indexablePaths().filter((p) => p !== '/app'), '/blog', ...visiblePosts.map((p) => `/blog/${p.slug}`)];
    const expected = [];
    for (const page of pages) {
      for (const alt of alternatesFor(page)) {
        if (alt.hreflang === 'x-default') continue;
        expected.push(alt.href);
        const locale = publishedLocales(page).find((code) => alt.hreflang === localeMeta(code).htmlLang);
        if (!locale) continue;
        const rel = localizePath(locale, page);
        const file = rel === '/' ? path.join(dist, 'index.html') : path.join(dist, rel.replace(/^\//, ''), 'index.html');
        assert.equal(fs.existsSync(file), true, `missing ${rel}`);
        const html = fs.readFileSync(file, 'utf8');
        const info = localeMeta(locale);
        assert.match(html, new RegExp(`<html lang="${info.htmlLang}" dir="${info.dir}">`));
        assert.match(html, new RegExp(`<link rel="canonical" href="${alt.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
        for (const link of alternatesFor(page)) {
          assert.ok(html.includes(`hreflang="${link.hreflang}"`), `${rel} missing ${link.hreflang}`);
        }
        if (info.dir === 'rtl') assert.match(html, /href="\/fonts\/rtl\.css"/);
        else assert.doesNotMatch(html, /href="\/fonts\/rtl\.css"/);
      }
    }
    assert.deepEqual([...locs].sort(), [...expected].sort());
  });
}

test('translate falls back to English when a catalog is missing', () => {
  assert.equal(translate('zz', 'nav.blog'), 'Blog');
});

if (failed) {
  console.error(`\n${failed} i18n test(s) failed`);
  process.exit(1);
}
console.log('i18n tests passed');
