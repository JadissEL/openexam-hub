// Tests for /tools/crs-language-points. Expected numbers are hand-copied from IRCC's
// "Comprehensive Ranking System (CRS) criteria" page on canada.ca, read 2026-11-27, independent of
// the tables under test (src/tools/crsLanguage.js). With --built, checks the prerendered page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CRS_TOOL_PATH, CRS_TOOL_TITLE, CRS_TOOL_DESCRIPTION, CRS_TOOL_FAQ, CRS_LAST_VERIFIED, CRS_URL,
  crsLanguagePoints, secondLanguagePoints, firstLanguagePoints, CRS_SECOND_LANGUAGE_MAX, CRS_LANGUAGE_CORE_MAX
} from '../src/tools/crsLanguage.js';
import { routeMeta, indexablePaths } from '../src/seo/site.js';
import { normPath } from '../lib/analytics/hits.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const built = process.argv.includes('--built');
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); } catch (err) { failed += 1; console.error(`  FAIL  ${name}`); console.error(`        ${err.message}`); }
}
const all = (l) => ({ reading: l, listening: l, writing: l, speaking: l });

// IRCC second official language: [CLB level, points with spouse, without]
const IRCC_SECOND = [[3, 0, 0], [4, 0, 0], [5, 1, 1], [6, 1, 1], [7, 3, 3], [8, 3, 3], [9, 6, 6], [10, 6, 6], [12, 6, 6]];
// IRCC first official language: [CLB level, with spouse, without]
const IRCC_FIRST = [[3, 0, 0], [4, 6, 6], [5, 6, 6], [6, 8, 9], [7, 16, 17], [8, 22, 23], [9, 29, 31], [10, 32, 34], [11, 32, 34]];

test('second official language points per ability equal IRCC’s grid', () => {
  for (const [l, w, wo] of IRCC_SECOND) {
    assert.equal(secondLanguagePoints(l, true), w, `CLB ${l} with spouse`);
    assert.equal(secondLanguagePoints(l, false), wo, `CLB ${l} without spouse`);
  }
});
test('first official language points per ability equal IRCC’s grid', () => {
  for (const [l, w, wo] of IRCC_FIRST) {
    assert.equal(firstLanguagePoints(l, true), w, `CLB ${l} with spouse`);
    assert.equal(firstLanguagePoints(l, false), wo, `CLB ${l} without spouse`);
  }
});
test('IRCC caps: second language 22 with spouse, 24 without; languages core 150 / 160', () => {
  assert.deepEqual(CRS_SECOND_LANGUAGE_MAX, [22, 24]);
  assert.deepEqual(CRS_LANGUAGE_CORE_MAX, [150, 160]);
  const w = crsLanguagePoints({ first: { language: 'en', levels: all(10) }, second: { language: 'fr', levels: all(9) }, withSpouse: true });
  assert.equal(w.second.raw, 24); assert.equal(w.second.total, 22); assert.ok(w.second.capped);
  assert.equal(w.first.total, 128); assert.equal(w.core.total, 150);
  const wo = crsLanguagePoints({ first: { language: 'en', levels: all(10) }, second: { language: 'fr', levels: all(9) }, withSpouse: false });
  assert.equal(wo.second.total, 24); assert.ok(!wo.second.capped); assert.equal(wo.first.total, 136); assert.equal(wo.core.total, 160);
});
test('French additional points: 50 with CLB 5+ English, 25 with CLB 4 or lower or no English, none below NCLC 7', () => {
  const strong = crsLanguagePoints({ first: { language: 'fr', levels: all(7) }, second: { language: 'en', levels: all(5) } });
  assert.equal(strong.frenchBonus, 50);
  const low = crsLanguagePoints({ first: { language: 'fr', levels: all(7) }, second: { language: 'en', levels: all(4) } });
  assert.equal(low.frenchBonus, 25);
  const none = crsLanguagePoints({ first: { language: 'fr', levels: all(8) }, second: null });
  assert.equal(none.frenchBonus, 25); assert.equal(none.frenchBonusCase, 'noEnglish');
  const asSecond = crsLanguagePoints({ first: { language: 'en', levels: all(9) }, second: { language: 'fr', levels: all(7) } });
  assert.equal(asSecond.frenchBonus, 50);
  const below = crsLanguagePoints({ first: { language: 'en', levels: all(9) }, second: { language: 'fr', levels: { ...all(9), speaking: 6 } } });
  assert.equal(below.frenchBonus, 0);
  const mixed = crsLanguagePoints({ first: { language: 'fr', levels: all(7) }, second: { language: 'en', levels: { ...all(5), writing: 4 } } });
  assert.equal(mixed.frenchBonus, 0); assert.equal(mixed.frenchBonusCase, 'mixedEnglish');
});
test('worked example: English CLB 9 all, French NCLC 7 all, no spouse', () => {
  const r = crsLanguagePoints({ first: { language: 'en', levels: all(9) }, second: { language: 'fr', levels: all(7) } });
  assert.equal(r.first.total, 124); // 4 x 31
  assert.equal(r.second.total, 12); // 4 x 3
  assert.equal(r.frenchBonus, 50);
});
test('empty or invalid levels earn 0 and are not complete', () => {
  const r = crsLanguagePoints({ first: { language: 'en', levels: { reading: '', listening: 'x', writing: -1, speaking: 99 } }, second: null });
  assert.equal(r.first.total, 0); assert.equal(r.first.complete, false);
});
test('meta, FAQ, sitemap and analytics path', () => {
  assert.equal(CRS_TOOL_PATH, '/tools/crs-language-points');
  assert.ok(CRS_TOOL_TITLE.length <= 60, `title ${CRS_TOOL_TITLE.length}`);
  assert.ok(CRS_TOOL_DESCRIPTION.length <= 160, `description ${CRS_TOOL_DESCRIPTION.length}`);
  const meta = routeMeta(CRS_TOOL_PATH);
  assert.equal(meta.canonical, 'https://openexamhub.org/tools/crs-language-points');
  assert.ok(indexablePaths().includes(CRS_TOOL_PATH));
  assert.equal(normPath(CRS_TOOL_PATH), CRS_TOOL_PATH);
  assert.match(CRS_URL, /^https:\/\/www\.canada\.ca\//);
  assert.match(CRS_LAST_VERIFIED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(CRS_TOOL_FAQ.length >= 4);
  assert.ok(CRS_TOOL_FAQ.some((f) => /22 points with a spouse/.test(f.a) && /24 without/.test(f.a)));
});

if (built) {
  const dist = path.join(root, 'dist');
  const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
  test('built /tools/crs-language-points: content, canonical, JSON-LD, no ads, links resolve', () => {
    const html = read('tools/crs-language-points/index.html');
    assert.ok(html.includes('<link rel="canonical" href="https://openexamhub.org/tools/crs-language-points"'));
    assert.ok(!/noindex/.test(html));
    assert.ok(html.includes('"@type":"WebApplication"') && html.includes('"@type":"FAQPage"') && html.includes('"@type":"BreadcrumbList"'));
    assert.ok(!/adsbygoogle|pagead2/.test(html), 'no ads off /app');
    assert.ok(html.includes('CLB 7 or 8') && html.includes('CLB 9 or more'), 'second-language table rendered');
    assert.ok(html.includes(CRS_URL), 'IRCC source link');
    for (const h of [...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1])) {
      if (h.startsWith('/assets/') || /\.(css|js|png|svg|ico|webmanifest|xml|txt|csv)$/.test(h)) continue;
      const p = h.replace(/\/+$/, '') || '/';
      const ok = p === '/' ? true : fs.existsSync(path.join(dist, p.slice(1), 'index.html')) || fs.existsSync(path.join(dist, p.slice(1)));
      assert.ok(ok, `internal link ${h} resolves`);
    }
    assert.ok(read('sitemap.xml').includes('<loc>https://openexamhub.org/tools/crs-language-points</loc>'));
    assert.ok(read('llms.txt').includes('/tools/crs-language-points'));
    assert.ok(read('tools/clb-converter/index.html').includes('href="/tools/crs-language-points"'), 'converter links to the CRS page');
  });
}

if (failed) { console.error(`\n${failed} CRS test(s) failed`); process.exit(1); }
console.log('\nCRS tests passed');
