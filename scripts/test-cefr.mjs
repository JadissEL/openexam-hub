// Tests for /tools/cefr-converter. Expected bands are hand-copied from the sources (IELTS, CELPIP,
// Pearson PTE Academic pages, and Campus France Maroc's "Grille de niveau TCF" PDF), read 2026-11-27.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEFR_CONVERTERS, CEFR_TOOL_PATH, CEFR_TOOL_TITLE, CEFR_TOOL_DESCRIPTION, CEFR_TOOL_FAQ, TCF_CEFR_GRID_URL, cefrFor } from '../src/tools/cefrData.js';
import { routeMeta, indexablePaths } from '../src/seo/site.js';
import { normPath } from '../lib/analytics/hits.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const built = process.argv.includes('--built');
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); } catch (err) { failed += 1; console.error(`  FAIL  ${name}`); console.error(`        ${err.message}`); }
}
const lvl = (id, v) => cefrFor(id, v).cefr;

test('IELTS: 5.5-6.5 B2, 7-8 C1, about 9 C2; 8.5 and below 5.5 unplaced', () => {
  assert.equal(lvl('IELTS', '5.5'), 'B2'); assert.equal(lvl('IELTS', '6.5'), 'B2');
  assert.equal(lvl('IELTS', '7'), 'C1'); assert.equal(lvl('IELTS', '8'), 'C1');
  assert.equal(lvl('IELTS', '9'), 'C2'); assert.ok(cefrFor('IELTS', '9').approx);
  assert.equal(lvl('IELTS', '8.5'), null); assert.equal(lvl('IELTS', '5'), null);
  assert.equal(cefrFor('IELTS', '6.3').ok, false, 'half-band steps only');
  assert.equal(cefrFor('IELTS', '6,5').cefr, 'B2', 'comma decimal');
});
test('CELPIP chart: 12 C2, 10-11 C1, 7-9 B2, 5-6 B1, 3-4 A2, 2 A1', () => {
  const exp = { 12: 'C2', 11: 'C1', 10: 'C1', 9: 'B2', 7: 'B2', 6: 'B1', 5: 'B1', 4: 'A2', 3: 'A2', 2: 'A1', 1: null };
  for (const [v, c] of Object.entries(exp)) assert.equal(lvl('CELPIP', v), c, `CELPIP ${v}`);
});
test('PTE Academic: 85-90 C2, 76-84 C1, 59-75 B2, 43-58 B1, 30-42 A2, 10-29 A1', () => {
  const exp = { 90: 'C2', 85: 'C2', 84: 'C1', 76: 'C1', 75: 'B2', 59: 'B2', 58: 'B1', 43: 'B1', 42: 'A2', 30: 'A2', 29: 'A1', 10: 'A1' };
  for (const [v, c] of Object.entries(exp)) assert.equal(lvl('PTE_ACADEMIC', v), c, `PTE ${v}`);
  assert.equal(cefrFor('PTE_ACADEMIC', '9').ok, false);
});
test('TCF grid (Campus France): points and /20 marks', () => {
  const pts = { 699: 'C2', 600: 'C2', 599: 'C1', 500: 'C1', 499: 'B2', 400: 'B2', 399: 'B1', 300: 'B1', 299: 'A2', 200: 'A2', 199: 'A1', 101: 'A1', 100: null };
  for (const [v, c] of Object.entries(pts)) assert.equal(lvl('TCF_POINTS', v), c, `TCF ${v} points`);
  const marks = { 20: 'C2', 18: 'C2', 17: 'C1', 14: 'C1', 13: 'B2', 10: 'B2', 9: 'B1', 6: 'B1', 5: 'A2', 2: 'A2', 1: 'A1', 0: null };
  for (const [v, c] of Object.entries(marks)) assert.equal(lvl('TCF_MARKS', v), c, `TCF ${v}/20`);
  assert.match(TCF_CEFR_GRID_URL, /^https:\/\/www\.maroc\.campusfrance\.org\//);
});
test('bands match the displayed tables and every table has sources and a date', () => {
  for (const c of Object.values(CEFR_CONVERTERS)) {
    assert.ok(c.table.sources.length && /^\d{4}-\d{2}-\d{2}$/.test(c.table.lastVerified), c.id);
    for (const s of c.table.sources) assert.match(s.url, /^https:\/\/(ielts\.org|www\.celpip\.ca|www\.pearsonpte\.com|www\.maroc\.campusfrance\.org)\//, s.url);
    for (const b of c.bands) assert.ok(c.table.rows.some((r) => r.cefr === b.cefr), `${c.id} ${b.cefr} row`);
  }
  assert.ok(!Object.keys(CEFR_CONVERTERS).some((k) => /TEF|PTE_CORE/.test(k)), 'no TEF or PTE Core conversion');
});
test('meta, sitemap, analytics path, FAQ', () => {
  assert.ok(CEFR_TOOL_TITLE.length <= 60 && CEFR_TOOL_DESCRIPTION.length <= 160);
  assert.equal(routeMeta(CEFR_TOOL_PATH).canonical, 'https://openexamhub.org/tools/cefr-converter');
  assert.equal(routeMeta(`${CEFR_TOOL_PATH}?tab=tcf`).canonical, 'https://openexamhub.org/tools/cefr-converter');
  assert.ok(indexablePaths().includes(CEFR_TOOL_PATH));
  assert.equal(normPath(CEFR_TOOL_PATH), CEFR_TOOL_PATH);
  assert.ok(CEFR_TOOL_FAQ.length >= 4);
});

if (built) {
  const dist = path.join(root, 'dist');
  const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
  test('built /tools/cefr-converter: content, canonical, JSON-LD, no ads, links resolve', () => {
    const html = read('tools/cefr-converter/index.html');
    assert.ok(html.includes('<link rel="canonical" href="https://openexamhub.org/tools/cefr-converter"'));
    assert.ok(!/noindex/.test(html));
    assert.ok(html.includes('"@type":"WebApplication"') && html.includes('"@type":"FAQPage"') && html.includes('"@type":"BreadcrumbList"'));
    assert.ok(!/adsbygoogle|pagead2/.test(html), 'no ads off /app');
    assert.ok(html.includes('400–499 points') && html.includes('59–75'), 'tables rendered');
    for (const h of [...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1])) {
      if (h.startsWith('/assets/') || /\.(css|js|png|svg|ico|webmanifest|xml|txt|csv)$/.test(h)) continue;
      const p = h.replace(/\/+$/, '') || '/';
      const ok = p === '/' || fs.existsSync(path.join(dist, p.slice(1), 'index.html')) || fs.existsSync(path.join(dist, p.slice(1)));
      assert.ok(ok, `internal link ${h} resolves`);
    }
    assert.ok(read('sitemap.xml').includes('<loc>https://openexamhub.org/tools/cefr-converter</loc>'));
    assert.ok(read('llms.txt').includes('/tools/cefr-converter'));
    assert.ok(read('tools/clb-converter/index.html').includes('href="/tools/cefr-converter"'));
  });
}

if (failed) { console.error(`\n${failed} CEFR test(s) failed`); process.exit(1); }
console.log('\nCEFR tests passed');
