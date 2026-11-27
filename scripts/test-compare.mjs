// Tests for the /compare pages (IDEA-13): data comes from IRCC's tables (src/tools/clbData.js) and the
// test owners' own CEFR charts (src/compare/compareData.js). With --built, also checks the prerendered
// dist/compare/<slug>/index.html files. Expected PTE Core numbers are hand-copied from canada.ca
// (Express Entry > Language test results), read 2026-11-27, independent of the tables under test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPARE_PAGES, comparePath, comparePageBySlug, CLB_TABLE_PAGE, COMPARE_HUB } from '../src/compare/comparePages.js';
import { TABLES, TEST_FORMATS, COMPARE_LAST_VERIFIED, SOURCE_URLS, PTE_ACADEMIC_CEFR, clbRows, clbCsv, EQUIVALENCY_TESTS, tableVerified, CSV_PATH } from '../src/compare/compareData.js';
import { routeMeta, indexablePaths } from '../src/seo/site.js';
import { normPath } from '../lib/analytics/hits.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const built = process.argv.includes('--built');
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

// IRCC PTE Core table: [level, speaking, listening, reading, writing] as printed on canada.ca.
const IRCC_PTE_CORE = [
  [10, '89+', '89+', '88+', '90+'],
  [9, '84-88', '82-88', '78-87', '88-89'],
  [8, '76-83', '71-81', '69-77', '79-87'],
  [7, '68-75', '60-70', '60-68', '69-78'],
  [6, '59-67', '50-59', '51-59', '60-68'],
  [5, '51-58', '39-49', '42-50', '51-59'],
  [4, '42-50', '28-38', '33-41', '41-50']
];

test('PTE Core bands equal IRCC’s printed table, CLB 4 to 10, on the 10-90 scale', () => {
  const t = TABLES.PTE_CORE;
  assert.equal(t.scaleMin, 10);
  IRCC_PTE_CORE.forEach(([level, ...cells]) => {
    ['speaking', 'listening', 'reading', 'writing'].forEach((skill, i) => {
      const r = t.bands[skill].find((b) => b.level === level);
      const printed = cells[i];
      if (printed.endsWith('+')) {
        assert.equal(r.min, Number(printed.slice(0, -1)), `${skill} CLB ${level} min`);
        assert.equal(r.max, 90, `${skill} CLB ${level} tops out at 90`);
      } else {
        const [lo, hi] = printed.split('-').map(Number);
        assert.deepEqual([r.min, r.max], [lo, hi], `${skill} CLB ${level}`);
      }
    });
  });
});

test('every compare page has unique slug, title ≤ 60, description ≤ 160, FAQ, sources and a verified date', () => {
  assert.ok(COMPARE_PAGES.length >= 2);
  const slugs = new Set();
  for (const page of COMPARE_PAGES) {
    assert.ok(!slugs.has(page.slug), `duplicate slug ${page.slug}`);
    slugs.add(page.slug);
    assert.ok(page.title.length <= 60, `${page.slug} title ${page.title.length}`);
    assert.ok(page.description.length <= 160, `${page.slug} description ${page.description.length}`);
    assert.ok(page.faq.length >= 4, `${page.slug} faq`);
    for (const id of page.tests || []) assert.ok(TABLES[id], `${page.slug} table ${id}`);
    for (const id of page.formats || page.tests) assert.ok(TEST_FORMATS[id], `${page.slug} format ${id}`);
    for (const m of page.cefr || []) assert.ok(m.sources.length && m.lastVerified, `${page.slug} ${m.id} sourced`);
    assert.ok((page.tests || []).length || (page.formats || []).length, `${page.slug} compares something`);
    assert.equal(comparePageBySlug(page.slug), page);
  }
  assert.match(COMPARE_LAST_VERIFIED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(new Date(`${COMPARE_LAST_VERIFIED}T00:00:00Z`) <= new Date(), 'verified date is not in the future');
});

test('sources are the official domains only', () => {
  for (const u of Object.values(SOURCE_URLS)) {
    assert.match(u, /^https:\/\/(www\.canada\.ca|ielts\.org|www\.celpip\.ca|www\.pearsonpte\.com|www\.lefrancaisdesaffaires\.fr|www\.france-education-international\.fr|www\.etudiant\.gouv\.fr|www\.maroc\.campusfrance\.org|www\.service-public\.gouv\.fr|www\.goethe\.de|www\.telc\.net|www\.bamf\.de|www\.daad\.de)\//, u);
  }
});

test('PTE Academic CEFR table is labelled as PTE Academic and never as PTE Core', () => {
  assert.equal(PTE_ACADEMIC_CEFR.exam, 'PTE Academic');
  assert.match(PTE_ACADEMIC_CEFR.scoreLabel, /PTE Academic/);
  assert.doesNotMatch(PTE_ACADEMIC_CEFR.scoreLabel, /Core/);
  for (const page of COMPARE_PAGES) {
    for (const m of page.cefr || []) assert.notEqual(m.id, 'PTE_CORE_CEFR', 'no PTE Core CEFR table exists');
  }
});

test('side-by-side rows: one per CLB level 10 to 4, one non-empty cell per test', () => {
  for (const page of COMPARE_PAGES) {
    for (const skill of ['reading', 'listening', 'writing', 'speaking']) {
      if (!(page.tests || []).length) continue;
      const rows = clbRows(page.tests, skill);
      assert.deepEqual(rows.map((r) => r.level), [10, 9, 8, 7, 6, 5, 4]);
      for (const r of rows) for (const c of r.cells) assert.ok(c.text, `${page.slug} ${skill} CLB ${r.level} ${c.tableId}`);
    }
  }
});

test('routes: meta, canonical, sitemap and the cookieless counter know every compare page', () => {
  const paths = indexablePaths();
  for (const page of COMPARE_PAGES) {
    const p = comparePath(page);
    const meta = routeMeta(p);
    assert.ok(meta, `${p} meta`);
    assert.equal(meta.title, page.title);
    assert.equal(meta.canonical, `https://openexamhub.org${p}`);
    assert.ok(paths.includes(p), `${p} in sitemap paths`);
    assert.equal(normPath(p), p, `${p} counted by /api/hit`);
  }
  assert.equal(routeMeta('/compare/not-a-page'), null);
});

test('equivalency table covers the five IRCC Express Entry tests, TEF on the Express Entry scale', () => {
  assert.deepEqual(EQUIVALENCY_TESTS, ['IELTS_GT', 'CELPIP_G', 'PTE_CORE', 'TEF_EXPRESS_ENTRY', 'TCF_CANADA']);
  for (const id of EQUIVALENCY_TESTS) {
    assert.equal(TABLES[id].expressEntry === false, false, `${id} is an Express Entry table`);
    assert.match(tableVerified(id), /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.ok(!EQUIVALENCY_TESTS.includes('TEF_NEW_699'), 'the /699 scale is not for Express Entry');
});

test('CSV: header, 5 tests x 4 skills x 7 levels, cells match the tables, source and date on every row', () => {
  const lines = clbCsv().trim().split('\n');
  assert.equal(lines[0], 'test,scale,skill,level,score,cell_type,source_url,last_verified');
  assert.equal(lines.length, 1 + 5 * 4 * 7);
  const parse = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, 8);
  const rows = lines.slice(1).map(parse);
  for (const r of rows) {
    assert.equal(r.length, 8);
    assert.match(r[6], /^https:\/\/www\.canada\.ca\//, 'source is canada.ca');
    assert.match(r[7], /^2026-\d{2}-\d{2}$/);
  }
  const find = (test, skill, level) => rows.find((r) => r[0] === test && r[2] === skill && r[3] === level)[4];
  // Hand-copied from canada.ca, independent of the tables.
  assert.equal(find('PTE Core', 'listening', 'CLB 7'), '60–70');
  assert.equal(find('PTE Core', 'writing', 'CLB 10+'), '90+');
  assert.equal(find('IELTS General Training', 'listening', 'CLB 9'), '8.0');
  assert.equal(find('CELPIP-General', 'reading', 'CLB 7'), '7');
  assert.equal(find('TCF Canada', 'reading', 'NCLC 7'), '453–498');
  assert.equal(find(TABLES.TEF_EXPRESS_ENTRY.label, 'speaking', 'NCLC 7'), '310–348');
  assert.equal(CSV_PATH, '/compare/clb-equivalency-table.csv');
});

test('hub and table page have meta, canonical and sitemap entries', () => {
  for (const c of [COMPARE_HUB, CLB_TABLE_PAGE]) {
    const meta = routeMeta(c.path);
    assert.equal(meta.title, c.title);
    assert.ok(c.title.length <= 60 && c.description.length <= 160, `${c.path} lengths`);
    assert.equal(meta.canonical, `https://openexamhub.org${c.path}`);
    assert.ok(indexablePaths().includes(c.path));
    assert.equal(normPath(c.path), c.path);
  }
});

test('PR 4: TEF vs TCF uses the NCLC Express Entry tables; DELF/TCF and Goethe/telc have no score tables', () => {
  const tef = comparePageBySlug('tef-vs-tcf');
  assert.deepEqual(tef.tests, ['TEF_EXPRESS_ENTRY', 'TCF_CANADA']);
  assert.equal(tef.scheme, 'NCLC');
  assert.ok(!tef.tests.includes('TEF_NEW_699'), '/699 scale is not for Express Entry');
  for (const slug of ['delf-vs-tcf', 'goethe-vs-telc']) {
    const p = comparePageBySlug(slug);
    assert.ok(!(p.tests || []).length, `${slug}: no score tables`);
    assert.ok(!(p.cefr || []).length, `${slug}: no score-to-CEFR tables`);
    assert.doesNotMatch(JSON.stringify(p.faq), /CLB tables are copied/, `${slug}: FAQ does not claim CLB tables`);
  }
  // NCLC 7 FAQ numbers come from the tables (hand-copied from canada.ca here).
  const nclc7 = tef.faq.find((f) => f.q.includes('NCLC 7')).a;
  for (const n of ['310–348', '249–279', '207–232', '458–502', '453–498', '10–11']) assert.ok(nclc7.includes(n), `NCLC 7 answer has ${n}`);
});

if (built) {
  const dist = path.join(root, 'dist');
  const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
  const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  const exists = (href) => {
    const p = href.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (p === '/') return fs.existsSync(path.join(dist, 'index.html'));
    return fs.existsSync(path.join(dist, p.slice(1), 'index.html')) || fs.existsSync(path.join(dist, p.slice(1)));
  };

  for (const page of COMPARE_PAGES) {
    const p = comparePath(page);
    test(`built ${p}: static HTML, canonical, JSON-LD, no ads, links resolve`, () => {
      const html = read(`${p.slice(1)}/index.html`);
      const head = html.split('</head>')[0];
      assert.ok(head.includes(`<link rel="canonical" href="https://openexamhub.org${p}" />`), 'canonical');
      assert.doesNotMatch(head, /name="robots"[^>]*noindex/);
      assert.doesNotMatch(html, /<script type="module"/, 'static page has no module script');
      assert.doesNotMatch(html, /adsbygoogle|googlesyndication|data-ad-slot/i, 'no ads outside /app');
      const types = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])['@type'] || 'graph');
      for (const t of ['BreadcrumbList', 'WebPage', 'FAQPage']) assert.ok(types.includes(t), `JSON-LD ${t}`);
      const faqLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((j) => j['@type'] === 'FAQPage');
      assert.equal(faqLd.mainEntity.length, page.faq.length, 'FAQ JSON-LD matches visible FAQ');
      const body = text(html);
      assert.ok(body.includes(page.h1), 'H1 text');
      for (const item of page.faq) assert.ok(body.includes(item.q), `visible FAQ ${item.q}`);
      assert.ok(/not affiliated with/.test(body), 'disclaimer');
      const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
      for (const h of hrefs) {
        if (h.startsWith('/assets/') || /\.(ico|svg|png|webmanifest|xml|css|js)$/.test(h.split('?')[0]) || h.startsWith('/app')) continue;
        assert.ok(exists(h), `internal link ${h} resolves in dist/`);
      }
      if ((page.tests || []).includes('PTE_CORE')) {
        for (const n of ['68–75', '60–70', '60–68', '69–78', '84–88', '82–88', '78–87', '88–89']) assert.ok(body.includes(n), `PTE Core cell ${n}`);
        assert.ok(body.includes('PTE Academic score'), 'PTE Academic CEFR table is labelled');
      }
    });
  }

  test('IELTS and CELPIP guide cards link to the compare pages', () => {
    assert.ok(read('exams/ielts/index.html').includes('href="/compare/ielts-vs-celpip"'));
    assert.ok(read('exams/ielts/index.html').includes('href="/compare/ielts-vs-pte"'));
    assert.ok(read('exams/celpip/index.html').includes('href="/compare/ielts-vs-celpip"'));
  });

  for (const [p, types] of [[CLB_TABLE_PAGE.path, ['BreadcrumbList', 'Dataset', 'FAQPage']], [COMPARE_HUB.path, ['BreadcrumbList', 'CollectionPage']]]) {
    test(`built ${p}: static HTML, JSON-LD, no ads, links resolve`, () => {
      const html = read(`${p.slice(1)}/index.html`);
      assert.ok(html.includes(`<link rel="canonical" href="https://openexamhub.org${p}" />`));
      assert.doesNotMatch(html, /<script type="module"/);
      assert.doesNotMatch(html, /adsbygoogle|googlesyndication|data-ad-slot/i);
      const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])['@type'] || 'graph');
      for (const t of types) assert.ok(ld.includes(t), `JSON-LD ${t}`);
      const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
      for (const h of hrefs) {
        if (h.startsWith('/assets/') || /\.(ico|svg|png|webmanifest|xml|css|js)$/.test(h.split('?')[0]) || h.startsWith('/app')) continue;
        assert.ok(exists(h), `internal link ${h} resolves in dist/`);
      }
    });
  }

  test('built CSV equals clbCsv() and the table page shows every test and the download link', () => {
    assert.equal(read(CSV_PATH.slice(1)), clbCsv());
    const html = read('compare/clb-equivalency-table/index.html');
    assert.ok(html.includes(`href="${CSV_PATH}"`));
    const body = text(html);
    for (const id of EQUIVALENCY_TESTS) assert.ok(body.includes(TABLES[id].label.replace(/&/g, '&')), `column ${id}`);
    for (const n of ['453–498', '310–348', '60–70', '6.0']) assert.ok(body.includes(n), `cell ${n}`);
    const hub = read('compare/index.html');
    for (const page of COMPARE_PAGES) assert.ok(hub.includes(`href="${comparePath(page)}"`), `hub links ${page.slug}`);
    assert.ok(hub.includes(`href="${CLB_TABLE_PAGE.path}"`));
    assert.ok(read('index.html').includes('href="/compare"'), 'footer links the hub');
  });

  test('built sitemap and llms.txt list the compare pages', () => {
    const sm = read('sitemap.xml');
    for (const page of COMPARE_PAGES) {
      assert.ok(sm.includes(`<loc>https://openexamhub.org${comparePath(page)}</loc>`), `sitemap ${page.slug}`);
      assert.ok(read('llms.txt').includes(`https://openexamhub.org${comparePath(page)}`), `llms.txt ${page.slug}`);
    }
    for (const p of [COMPARE_HUB.path, CLB_TABLE_PAGE.path]) assert.ok(sm.includes(`<loc>https://openexamhub.org${p}</loc>`), `sitemap ${p}`);
  });
}

if (built) {
  const read = (rel) => fs.readFileSync(path.join(root, 'dist', rel), 'utf8');
  test('guides and the CLB converter cross-link the new compare pages and tools', () => {
    const expect = {
      'exams/tef-canada/index.html': ['/compare/tef-vs-tcf', '/tools/crs-language-points'],
      'exams/tcf-canada/index.html': ['/compare/tef-vs-tcf', '/tools/cefr-converter?tab=tcf', '/tools/crs-language-points'],
      'exams/tcf/index.html': ['/compare/delf-vs-tcf', '/tools/cefr-converter?tab=tcf'],
      'exams/delf/index.html': ['/compare/delf-vs-tcf', '/compare/tef-vs-tcf'],
      'exams/goethe/index.html': ['/compare/goethe-vs-telc'],
      'exams/telc/index.html': ['/compare/goethe-vs-telc'],
      'exams/ielts/index.html': ['/tools/cefr-converter', '/tools/crs-language-points'],
      'exams/celpip/index.html': ['/compare/celpip-vs-pte', '/tools/cefr-converter?tab=celpip'],
      'tools/clb-converter/index.html': ['/compare/tef-vs-tcf', '/compare/delf-vs-tcf', '/compare/celpip-vs-pte', '/compare/clb-equivalency-table', '/tools/cefr-converter', '/tools/crs-language-points']
    };
    for (const [rel, hrefs] of Object.entries(expect)) {
      const html = read(rel);
      for (const h of hrefs) assert.ok(html.includes(`href="${h}"`), `${rel} links ${h}`);
    }
  });
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\ncompare tests passed');
