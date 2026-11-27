// Unit tests for the NCLC converter tables (src/tools/clbData.js) and, with --built, checks on the
// prerendered /tools/clb-converter page in dist/. Every expected number below is a boundary value
// copied by hand from canada.ca, independent of the tables under test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TABLES, TABLE_IDS, SKILLS, levelFor, parseScore, maxScore, minScore, convert, crsPointsFor,
  plannerHref, recommendedLevel, levelLabel, formatScore, LAST_VERIFIED, ENGLISH_LAST_VERIFIED, EE_LANGUAGE_MODIFIED,
  EE_LANGUAGE_URL, START_UP_URL, CRS_URL
} from '../src/tools/clbData.js';
import { TOOL_FAQ, TOOL_PATH } from '../src/tools/clbContent.js';
import { isPlannerDeepLink, parsePlannerQuery, parsePlannerDays, parsePlannerVariant } from '../lib/exams.js';
import { HIT_EVENTS, normPath, sanitizeBeacon, validRecord } from '../lib/analytics/hits.js';
import { SITEMAP_PATHS } from './blog-data.mjs';
import { routeMeta } from '../src/seo/site.js';

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

// [skill, score, expected level] triples, straight from the IRCC tables (0 = below NCLC 4, null = off the table).
const CASES = {
  TEF_EXPRESS_ENTRY: [
    ['reading', 120, 0], ['reading', 121, 4], ['reading', 150, 4], ['reading', 151, 5], ['reading', 180, 5], ['reading', 181, 6],
    ['reading', 206, 6], ['reading', 207, 7], ['reading', 232, 7], ['reading', 233, 8], ['reading', 247, 8], ['reading', 248, 9],
    ['reading', 262, 9], ['reading', 263, 10], ['reading', 300, 10], ['reading', 301, null],
    ['listening', 144, 0], ['listening', 145, 4], ['listening', 180, 4], ['listening', 181, 5], ['listening', 216, 5], ['listening', 217, 6],
    ['listening', 248, 6], ['listening', 249, 7], ['listening', 279, 7], ['listening', 280, 8], ['listening', 297, 8], ['listening', 298, 9],
    ['listening', 315, 9], ['listening', 316, 10], ['listening', 360, 10], ['listening', 361, null],
    ['writing', 180, 0], ['writing', 181, 4], ['writing', 225, 4], ['writing', 226, 5], ['writing', 270, 5], ['writing', 271, 6],
    ['writing', 309, 6], ['writing', 310, 7], ['writing', 348, 7], ['writing', 349, 8], ['writing', 370, 8], ['writing', 371, 9],
    ['writing', 392, 9], ['writing', 393, 10], ['writing', 450, 10], ['writing', 451, null],
    ['speaking', 180, 0], ['speaking', 181, 4], ['speaking', 225, 4], ['speaking', 226, 5], ['speaking', 309, 6], ['speaking', 310, 7],
    ['speaking', 348, 7], ['speaking', 349, 8], ['speaking', 370, 8], ['speaking', 371, 9], ['speaking', 392, 9], ['speaking', 393, 10],
    ['speaking', 450, 10], ['speaking', 451, null]
  ],
  TEF_NEW_699: [
    ['reading', 305, 0], ['reading', 306, 4], ['reading', 351, 4], ['reading', 352, 5], ['reading', 392, 5], ['reading', 393, 6],
    ['reading', 433, 6], ['reading', 434, 7], ['reading', 461, 7], ['reading', 462, 8], ['reading', 502, 8], ['reading', 503, 9],
    ['reading', 545, 9], ['reading', 546, 10], ['reading', 699, 10], ['reading', 700, null],
    ['listening', 305, 0], ['listening', 306, 4], ['listening', 433, 6], ['listening', 434, 7], ['listening', 461, 7], ['listening', 462, 8],
    ['listening', 545, 9], ['listening', 546, 10],
    ['writing', 267, 0], ['writing', 268, 4], ['writing', 329, 4], ['writing', 330, 5], ['writing', 378, 5], ['writing', 379, 6],
    ['writing', 427, 6], ['writing', 428, 7], ['writing', 471, 7], ['writing', 472, 8], ['writing', 511, 8], ['writing', 512, 9],
    ['writing', 557, 9], ['writing', 558, 10], ['writing', 699, 10],
    ['speaking', 327, 0], ['speaking', 328, 4], ['speaking', 386, 4], ['speaking', 387, 5], ['speaking', 421, 5], ['speaking', 422, 6],
    ['speaking', 455, 6], ['speaking', 456, 7], ['speaking', 493, 7], ['speaking', 494, 8], ['speaking', 517, 8], ['speaking', 518, 9],
    ['speaking', 555, 9], ['speaking', 556, 10], ['speaking', 699, 10]
  ],
  TCF_CANADA: [
    ['reading', 341, 0], ['reading', 342, 4], ['reading', 374, 4], ['reading', 375, 5], ['reading', 405, 5], ['reading', 406, 6],
    ['reading', 452, 6], ['reading', 453, 7], ['reading', 498, 7], ['reading', 499, 8], ['reading', 523, 8], ['reading', 524, 9],
    ['reading', 548, 9], ['reading', 549, 10], ['reading', 699, 10], ['reading', 700, null],
    ['listening', 330, 0], ['listening', 331, 4], ['listening', 368, 4], ['listening', 369, 5], ['listening', 397, 5], ['listening', 398, 6],
    ['listening', 457, 6], ['listening', 458, 7], ['listening', 502, 7], ['listening', 503, 8], ['listening', 522, 8], ['listening', 523, 9],
    ['listening', 548, 9], ['listening', 549, 10], ['listening', 699, 10], ['listening', 700, null],
    ['writing', 0, 0], ['writing', 3, 0], ['writing', 4, 4], ['writing', 5, 4], ['writing', 6, 5], ['writing', 7, 6], ['writing', 9, 6],
    ['writing', 10, 7], ['writing', 11, 7], ['writing', 12, 8], ['writing', 13, 8], ['writing', 14, 9], ['writing', 15, 9], ['writing', 16, 10],
    ['writing', 20, 10], ['writing', 21, null],
    ['speaking', 3, 0], ['speaking', 4, 4], ['speaking', 5, 4], ['speaking', 6, 5], ['speaking', 7, 6], ['speaking', 9, 6], ['speaking', 10, 7],
    ['speaking', 11, 7], ['speaking', 12, 8], ['speaking', 13, 8], ['speaking', 14, 9], ['speaking', 15, 9], ['speaking', 16, 10],
    ['speaking', 20, 10], ['speaking', 21, null]
  ],
  // IELTS General Training, from IRCC's Express Entry language test results page (date modified 2026-10-16).
  // IRCC lists one score per level; 0.5 steps between two listed scores stay at the lower level.
  IELTS_GT: [
    ['reading', 3.0, 0], ['reading', 3.5, 4], ['reading', 4.0, 5], ['reading', 4.5, 5], ['reading', 5.0, 6], ['reading', 5.5, 6],
    ['reading', 6.0, 7], ['reading', 6.5, 8], ['reading', 7.0, 9], ['reading', 7.5, 9], ['reading', 8.0, 10], ['reading', 9.0, 10], ['reading', 9.5, null],
    ['listening', 4.0, 0], ['listening', 4.5, 4], ['listening', 5.0, 5], ['listening', 5.5, 6], ['listening', 6.0, 7], ['listening', 6.5, 7],
    ['listening', 7.0, 7], ['listening', 7.5, 8], ['listening', 8.0, 9], ['listening', 8.5, 10], ['listening', 9.0, 10],
    ['writing', 3.5, 0], ['writing', 4.0, 4], ['writing', 4.5, 4], ['writing', 5.0, 5], ['writing', 5.5, 6], ['writing', 6.0, 7],
    ['writing', 6.5, 8], ['writing', 7.0, 9], ['writing', 7.5, 10], ['writing', 9.0, 10],
    ['speaking', 3.5, 0], ['speaking', 4.0, 4], ['speaking', 5.0, 5], ['speaking', 5.5, 6], ['speaking', 6.0, 7], ['speaking', 6.5, 8],
    ['speaking', 7.0, 9], ['speaking', 7.5, 10], ['speaking', 9.0, 10]
  ],
  // CELPIP-General: IRCC lists CLB level = CELPIP level for 4 to 9, and "10+" for CLB 10 (scale tops out at 12).
  CELPIP_G: [
    ...['reading', 'listening', 'writing', 'speaking'].flatMap((skill) => [
      [skill, 0, 0], [skill, 3, 0], [skill, 4, 4], [skill, 5, 5], [skill, 6, 6], [skill, 7, 7], [skill, 8, 8], [skill, 9, 9],
      [skill, 10, 10], [skill, 11, 10], [skill, 12, 10], [skill, 13, null]
    ])
  ]
};

test('boundary values on every IRCC table (hand-copied from canada.ca)', () => {
  assert.deepEqual(Object.keys(CASES).sort(), [...TABLE_IDS].sort());
  let n = 0;
  for (const [tableId, cases] of Object.entries(CASES)) {
    for (const [skill, score, expected] of cases) {
      assert.equal(levelFor(tableId, skill, score), expected, `${tableId} ${skill} ${score}`);
      n += 1;
    }
  }
  assert.ok(n > 260, `expected 260+ boundary checks, ran ${n}`);
});

test('each table has seven contiguous bands (NCLC 4 to 10) per skill, no gaps or overlaps', () => {
  for (const id of TABLE_IDS) {
    for (const skill of SKILLS) {
      const rows = TABLES[id].bands[skill];
      assert.deepEqual(rows.map((r) => r.level), [4, 5, 6, 7, 8, 9, 10], `${id} ${skill} levels`);
      rows.forEach((r, i) => {
        assert.ok(r.min <= r.max, `${id} ${skill} L${r.level} min<=max`);
        if (i > 0) assert.equal(r.min, Number((rows[i - 1].max + TABLES[id].step).toFixed(1)), `${id} ${skill} L${r.level} follows L${rows[i - 1].level} with no gap`);
      });
    }
  }
});

test('every score between 0 and the table maximum maps to exactly one answer (monotonic)', () => {
  for (const id of TABLE_IDS) {
    for (const skill of SKILLS) {
      let prev = 0;
      const step = TABLES[id].step;
      for (let i = 0; i * step <= maxScore(id, skill); i++) {
        const sc = Number((i * step).toFixed(1));
        const l = levelFor(id, skill, sc);
        assert.ok(l !== null && l >= prev, `${id} ${skill} ${sc}`);
        prev = l;
      }
      assert.equal(levelFor(id, skill, minScore(id, skill) - step), 0);
      assert.equal(levelFor(id, skill, maxScore(id, skill) + step), null);
    }
  }
});

test('table maxima and the TEF speaking = writing rule match IRCC', () => {
  assert.deepEqual(SKILLS.map((s) => maxScore('TEF_EXPRESS_ENTRY', s)), [300, 360, 450, 450]);
  assert.deepEqual(SKILLS.map((s) => maxScore('TEF_NEW_699', s)), [699, 699, 699, 699]);
  assert.deepEqual(SKILLS.map((s) => maxScore('TCF_CANADA', s)), [699, 699, 20, 20]);
  assert.deepEqual(SKILLS.map((s) => maxScore('IELTS_GT', s)), [9, 9, 9, 9]);
  assert.deepEqual(SKILLS.map((s) => maxScore('CELPIP_G', s)), [12, 12, 12, 12]);
  assert.deepEqual(TABLES.TEF_EXPRESS_ENTRY.bands.speaking, TABLES.TEF_EXPRESS_ENTRY.bands.writing);
  assert.deepEqual(TABLES.TEF_NEW_699.bands.reading, TABLES.TEF_NEW_699.bands.listening);
});

test('the Express Entry TEF table is the "ancien score" scale, not the /699 scale', () => {
  assert.equal(TABLES.TEF_EXPRESS_ENTRY.expressEntry, true);
  assert.equal(TABLES.TEF_NEW_699.expressEntry, false);
  // 500 on the /699 scale is NCLC 8; the same number is off the Express Entry reading scale (max 300).
  assert.equal(levelFor('TEF_NEW_699', 'reading', 500), 8);
  assert.equal(levelFor('TEF_EXPRESS_ENTRY', 'reading', 500), null);
  assert.equal(convert('TEF_NEW_699', { reading: 500, listening: 500, writing: 500, speaking: 500 }).crs, null);
});

test('IELTS General Training: IRCC rows for CLB 7, 8, 9 and 10 per skill (hand-copied)', () => {
  // [CLB, speaking, listening, reading, writing] as IRCC lists them (CLB 10 = lowest score of "7.5-9.0" etc).
  const rows = [[7, 6.0, 6.0, 6.0, 6.0], [8, 6.5, 7.5, 6.5, 6.5], [9, 7.0, 8.0, 7.0, 7.0], [10, 7.5, 8.5, 8.0, 7.5]];
  for (const [clb, sp, li, re, wr] of rows) {
    const a = convert('IELTS_GT', { speaking: sp, listening: li, reading: re, writing: wr });
    assert.equal(a.complete, true);
    assert.deepEqual(SKILLS.map((s) => a.perSkill[s].level), [clb, clb, clb, clb], `all four at the listed score give CLB ${clb}`);
    // One half-band under the listed score drops that skill below the level (CLB 8 listening: 7.0 is still CLB 7).
    const under = convert('IELTS_GT', { speaking: sp - 0.5, listening: li, reading: re, writing: wr });
    assert.ok(under.perSkill.speaking.level < clb, `speaking ${sp - 0.5} is under CLB ${clb}`);
  }
  assert.equal(TABLES.IELTS_GT.bands.listening.find((b) => b.level === 10).min, 8.5);
  assert.equal(TABLES.IELTS_GT.bands.reading.find((b) => b.level === 4).min, 3.5);
  assert.equal(convert('IELTS_GT', { speaking: 6, listening: 7, reading: 6.5, writing: 6.5 }).perSkill.listening.level, 7);
});

test('CELPIP-General: CLB equals the CELPIP level from 4 to 9, 10 and above is CLB 10', () => {
  for (const s of SKILLS) {
    for (const l of [4, 5, 6, 7, 8, 9]) assert.equal(levelFor('CELPIP_G', s, l), l);
    assert.equal(levelFor('CELPIP_G', s, 12), 10);
  }
});

test('English tables: IELTS and CELPIP are Express Entry tables, use CLB wording and no French bonus', () => {
  for (const id of ['IELTS_GT', 'CELPIP_G']) {
    assert.equal(TABLES[id].expressEntry, true);
    assert.equal(TABLES[id].scheme, 'CLB');
    assert.equal(TABLES[id].language, 'en');
    assert.match(TABLES[id].notice, /Express Entry accepts/);
    assert.equal(convert(id, { reading: 9, listening: 9, writing: 9, speaking: 9 }).frenchBonusEligible, false);
  }
  assert.match(TABLES.IELTS_GT.notice, /General Training only/);
  assert.match(TABLES.IELTS_GT.notice, /Academic/);
  assert.equal(levelLabel(7, 'CLB'), 'CLB 7');
  assert.equal(levelLabel(12, 'CLB'), 'CLB 10');
  assert.equal(levelLabel(0, 'CLB'), 'Below CLB 4');
  assert.equal(levelLabel(7), 'NCLC 7');
  assert.equal(formatScore('IELTS_GT', 6), '6.0');
  assert.equal(formatScore('CELPIP_G', 9), '9');
  const a = convert('CELPIP_G', { reading: 9, listening: 9, writing: 9, speaking: 9 }, { withSpouse: true });
  assert.equal(a.lowest, 9);
  assert.equal(a.meets9, true);
  assert.equal(a.crs.total, 29 * 4);
  assert.equal(a.crs.max, 128);
  const b = convert('IELTS_GT', { reading: 6.5, listening: 7.5, writing: 6.5, speaking: 6.5 });
  assert.equal(b.lowest, 8);
  assert.equal(b.crs.total, 23 * 4);
  assert.equal(b.crs.max, 136);
});

test('parseScore for IELTS takes half-bands (dot or comma) and CELPIP takes whole numbers only', () => {
  assert.equal(parseScore('IELTS_GT', 'reading', '6.5').value, 6.5);
  assert.equal(parseScore('IELTS_GT', 'reading', '6,5').value, 6.5);
  assert.equal(parseScore('IELTS_GT', 'reading', '7').value, 7);
  assert.equal(parseScore('IELTS_GT', 'reading', '9').ok, true);
  for (const bad of ['6.3', '6.25', '9.5', '10', 'abc', '-1', '6.', '.5']) assert.equal(parseScore('IELTS_GT', 'reading', bad).ok, false, bad);
  assert.match(parseScore('IELTS_GT', 'reading', '9.5').error, /9\.0/);
  assert.deepEqual(parseScore('IELTS_GT', 'reading', ''), { ok: false, empty: true });
  assert.equal(parseScore('CELPIP_G', 'speaking', '12').ok, true);
  for (const bad of ['13', '7.5', '7,5', 'x']) assert.equal(parseScore('CELPIP_G', 'speaking', bad).ok, false, bad);
  assert.match(parseScore('CELPIP_G', 'speaking', '13').error, /12/);
});

test('CRS first-official-language points per ability: spouse vs single, every level', () => {
  const spouse = { 0: 0, 3: 0, 4: 6, 5: 6, 6: 8, 7: 16, 8: 22, 9: 29, 10: 32, 11: 32, 12: 32 };
  const single = { 0: 0, 3: 0, 4: 6, 5: 6, 6: 9, 7: 17, 8: 23, 9: 31, 10: 34, 11: 34, 12: 34 };
  for (const [l, pts] of Object.entries(spouse)) assert.equal(crsPointsFor(Number(l), true), pts, `spouse CLB ${l}`);
  for (const [l, pts] of Object.entries(single)) assert.equal(crsPointsFor(Number(l), false), pts, `single CLB ${l}`);
  assert.equal(crsPointsFor(10, true) * 4, 128);
  assert.equal(crsPointsFor(10, false) * 4, 136);
});

test('parseScore accepts whole numbers on the scale and rejects the rest', () => {
  assert.deepEqual(parseScore('TCF_CANADA', 'reading', ''), { ok: false, empty: true });
  assert.deepEqual(parseScore('TCF_CANADA', 'reading', '   '), { ok: false, empty: true });
  assert.equal(parseScore('TCF_CANADA', 'reading', '453').value, 453);
  assert.equal(parseScore('TCF_CANADA', 'reading', '0453').value, 453);
  assert.equal(parseScore('TCF_CANADA', 'speaking', '20').ok, true);
  assert.equal(parseScore('TCF_CANADA', 'speaking', '21').ok, false);
  for (const bad of ['abc', '1e3', '-1', '12.5', '12,5', '+7', '99999']) {
    assert.equal(parseScore('TCF_CANADA', 'reading', bad).ok, false, bad);
  }
  assert.match(parseScore('TEF_EXPRESS_ENTRY', 'reading', '301').error, /300/);
});

test('convert: lowest level, NCLC 7 and 9 checks, which skills fall short', () => {
  const a = convert('TCF_CANADA', { reading: 453, listening: 458, writing: 10, speaking: 10 });
  assert.equal(a.complete, true);
  assert.equal(a.lowest, 7);
  assert.equal(a.meets7, true);
  assert.equal(a.meets9, false);
  assert.deepEqual(a.below9, ['reading', 'listening', 'writing', 'speaking']);
  assert.equal(a.crs.total, 17 * 4);
  assert.equal(a.crs.max, 136);
  assert.equal(a.frenchBonusEligible, true);

  const b = convert('TCF_CANADA', { reading: 452, listening: 520, writing: 14, speaking: 16 }, { withSpouse: true });
  assert.equal(b.lowest, 6);
  assert.equal(b.meets7, false);
  assert.deepEqual(b.below7, ['reading']);
  assert.deepEqual(b.perSkill.listening.level, 8);
  assert.equal(b.crs.total, 8 + 22 + 29 + 32);
  assert.equal(b.crs.max, 128);
  assert.equal(b.frenchBonusEligible, false);

  const c = convert('TEF_EXPRESS_ENTRY', { reading: 263, listening: 316, writing: 393, speaking: 393 });
  assert.equal(c.lowest, 10);
  assert.equal(c.meets9, true);
  assert.equal(c.crs.total, 136);

  const d = convert('TEF_EXPRESS_ENTRY', { reading: 100, listening: 316, writing: 393, speaking: 393 });
  assert.equal(d.lowest, 0);
  assert.equal(levelLabel(d.lowest), 'Below NCLC 4');
  assert.equal(d.perSkill.reading.points, 0);
});

test('convert with missing or invalid fields is incomplete and gives no verdict', () => {
  const r = convert('TCF_CANADA', { reading: '500', listening: '', writing: 'x', speaking: '12' });
  assert.equal(r.complete, false);
  assert.equal(r.lowest, null);
  assert.equal(r.meets7, null);
  assert.equal(r.crs, null);
  assert.equal(r.perSkill.reading.level, 8);
  assert.equal(r.perSkill.listening.empty, true);
  assert.equal(r.perSkill.writing.ok, false);
  assert.equal(convert('TCF_CANADA', {}).complete, false);
});

test('CTA picks the planner level from the gap and is a valid planner deep link', () => {
  assert.equal(recommendedLevel(null), 'B2');
  assert.equal(recommendedLevel(0), 'B2');
  assert.equal(recommendedLevel(6), 'B2');
  assert.equal(recommendedLevel(7), 'C1');
  assert.equal(recommendedLevel(8), 'C1');
  assert.equal(recommendedLevel(10), 'C1');
  assert.equal(plannerHref('TEF_EXPRESS_ENTRY', 6), '/app?exam=TEF_CANADA&level=B2&days=30&utm_source=clb-tool');
  assert.equal(plannerHref('TEF_NEW_699', 8), '/app?exam=TEF_CANADA&level=C1&days=30&utm_source=clb-tool');
  assert.equal(plannerHref('TCF_CANADA', 7), '/app?exam=TCF_CANADA&level=C1&days=30&utm_source=clb-tool');
  assert.equal(plannerHref('TCF_CANADA', null), '/app?exam=TCF_CANADA&level=B2&days=30&utm_source=clb-tool');
  assert.equal(plannerHref('IELTS_GT', 6), '/app?exam=IELTS&level=B2&days=30&utm_source=clb-tool');
  assert.equal(plannerHref('IELTS_GT', 8), '/app?exam=IELTS&level=C1&days=30&utm_source=clb-tool');
  assert.equal(plannerHref('CELPIP_G', 6), '/app?exam=CELPIP&level=B2&days=30&utm_source=clb-tool');
  assert.equal(plannerHref('CELPIP_G', 8), '/app?exam=CELPIP&level=C1&days=30&utm_source=clb-tool');
  for (const id of TABLE_IDS) {
    for (const lvl of [null, 5, 7, 9]) {
      const qs = plannerHref(id, lvl).split('?')[1];
      assert.equal(isPlannerDeepLink(qs), true, `${id} ${lvl}`);
      assert.equal(parsePlannerDays(qs), 30);
    }
  }
  const q = parsePlannerQuery(plannerHref('TCF_CANADA', 5).split('?')[1]);
  assert.equal(q.exam, 'TCF');
  assert.equal(q.level, 'B2');
  assert.equal(parsePlannerVariant(plannerHref('TCF_CANADA', 5).split('?')[1]), 'canada');
});

test('sources are canada.ca and the verified date is a real, not-future date', () => {
  for (const u of [EE_LANGUAGE_URL, START_UP_URL, CRS_URL]) assert.match(u, /^https:\/\/www\.canada\.ca\/en\/immigration-refugees-citizenship\//);
  for (const id of TABLE_IDS) assert.match(TABLES[id].sourceUrl, /^https:\/\/www\.canada\.ca\//);
  assert.equal(TABLES.IELTS_GT.sourceUrl, EE_LANGUAGE_URL);
  assert.equal(TABLES.CELPIP_G.sourceUrl, EE_LANGUAGE_URL);
  for (const date of [ENGLISH_LAST_VERIFIED, EE_LANGUAGE_MODIFIED]) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(new Date(`${date}T00:00:00Z`).getTime() <= Date.now() + 864e5, `${date} must not be in the future`);
  }
  assert.ok(EE_LANGUAGE_MODIFIED <= ENGLISH_LAST_VERIFIED, 'page modified date is not after the day it was read');
  assert.match(LAST_VERIFIED, /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date(`${LAST_VERIFIED}T00:00:00Z`);
  assert.ok(!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 864e5, 'LAST_VERIFIED must not be in the future');
});

test('route, meta, sitemap and cookieless counter are wired', () => {
  assert.equal(TOOL_PATH, '/tools/clb-converter');
  const meta = routeMeta(TOOL_PATH);
  assert.ok(meta, 'routeMeta knows the tool');
  assert.equal(meta.canonical, 'https://openexamhub.org/tools/clb-converter');
  assert.ok(meta.title.length <= 75, `title length ${meta.title.length}`);
  assert.match(meta.title, /IELTS.*CELPIP/);
  assert.match(meta.description, /IELTS General Training, CELPIP-General/);
  assert.ok(meta.description.length <= 200, `description length ${meta.description.length}`);
  assert.ok(SITEMAP_PATHS.includes(TOOL_PATH), 'sitemap paths include the tool');
  assert.ok(HIT_EVENTS.includes('clb_tool_used'));
  assert.equal(normPath('/tools/clb-converter'), '/tools/clb-converter');
  assert.equal(normPath('/tools/other'), '(other)');
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.deepEqual(sanitizeBeacon({ t: 'event', e: 'clb_tool_used' }, ua), { t: 'event', e: 'clb_tool_used', a: null });
  assert.equal(sanitizeBeacon({ t: 'event', e: 'something_else' }, ua), null);
  assert.deepEqual(validRecord({ t: 'event', e: 'clb_tool_used' }), { t: 'event', e: 'clb_tool_used', a: null });
});

test('cookie banner Accept and Reject are real buttons in tab order', () => {
  const src = fs.readFileSync(path.join(root, 'public/oeh-consent.js'), 'utf8');
  assert.match(src, /createElement\('button'\)/);
  assert.match(src, /b\.type = 'button'/);
  assert.match(src, /b\.tabIndex = 0/);
  assert.doesNotMatch(src, /tabIndex\s*=\s*-1/);
  assert.match(src, /insertBefore\(banner, d\.body\.firstChild\)/);
});

if (process.argv.includes('--built')) {
  const dist = path.join(root, 'dist');
  const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
  const jsonLdBlocks = (html) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const visibleText = (html) =>
    html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ');

  test('built /tools/clb-converter is prerendered with content, canonical, JSON-LD and no noindex', () => {
    const rel = 'tools/clb-converter/index.html';
    assert.ok(fs.existsSync(path.join(dist, rel)), `missing ${rel}`);
    const html = read(rel);
    const url = 'https://openexamhub.org/tools/clb-converter';
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}"`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${url}"`));
    assert.doesNotMatch(html, /name="robots"[^>]*noindex/);
    assert.match(html, /<title>IELTS, CELPIP, TEF &amp; TCF to CLB \(NCLC\) converter · OpenExam Hub<\/title>/);
    assert.match(html, /<h1[^>]*>IELTS, CELPIP, TEF Canada and TCF Canada to CLB \(NCLC\) score converter<\/h1>/);
    assert.match(html, /<script type="module"/, 'interactive page keeps its module script so React takes over');
    const text = visibleText(html);
    for (const needle of [
      'Not affiliated with IRCC', 'Verify your level on canada.ca', 'Tables checked on', 'Équivalence ancien score',
      'Get a free study plan to reach CLB 7/9', '263–300', '316–360', '393–450', '549–699', '16–20', '546–699', '558–699',
      'CRS points for the first official language', 'canada.ca',
      // IELTS General Training and CELPIP-General rows, their IRCC source date and the scope notes
      'IELTS General Training', 'CELPIP-General', '7.5–9.0', '8.5–9.0', '8.0–9.0', '10+', 'was last modified on 16 October 2026',
      'Express Entry accepts IELTS General Training only, not IELTS Academic', 'The tool gives no score guarantees',
      'IELTS and CELPIP tables last verified on'
    ]) assert.ok(text.includes(needle) || html.includes(needle), `page text missing: ${needle}`);
    assert.ok(html.includes('href="/app?exam=TEF_CANADA&amp;level=B2&amp;days=30&amp;utm_source=clb-tool"'), 'default CTA link');
    for (const u of [EE_LANGUAGE_URL, START_UP_URL, CRS_URL]) assert.ok(html.includes(u), `source link ${u}`);
    assert.match(html, /<time dateTime="2026-10-16">|<time datetime="2026-10-16">/, 'IRCC page modified date is marked up');
    assert.ok(html.includes('href="/exams/ielts"'), 'converter links to the IELTS guide');
    for (const label of [
      'IRCC TEF Canada table',
      'IRCC TEF Canada Score /699 table',
      'IRCC TCF Canada table',
      'IRCC IELTS General Training table',
      'IRCC CELPIP-General table',
      'IRCC CRS first official language points table'
    ]) {
      assert.ok(html.includes(`role="region"`) && html.includes(`tabindex="0"`) && html.includes(`aria-label="${label}"`), `scrollable table region: ${label}`);
    }
    assert.ok(html.includes('#BC3D0B'), 'header Hub word uses a slightly darker rust for 4.5:1 contrast');
    assert.ok((html.match(/bg-\[#C2410C\]/g) || []).length >= 1 || html.includes('#C2410C'), 'primary CTA uses #C2410C (white text passes AA)');
    const blocks = jsonLdBlocks(html);
    const all = blocks.flatMap((b) => (b['@graph'] ? b['@graph'] : [b]));
    const types = all.map((b) => b['@type']);
    for (const need of ['Organization', 'WebSite', 'BreadcrumbList', 'WebApplication', 'FAQPage']) assert.ok(types.includes(need), `JSON-LD ${need}`);
    const app = all.find((b) => b['@type'] === 'WebApplication');
    assert.equal(app.url, url);
    assert.equal(app.isAccessibleForFree, true);
    const faq = all.find((b) => b['@type'] === 'FAQPage');
    assert.equal(faq.mainEntity.length, TOOL_FAQ.length);
    for (const item of TOOL_FAQ) assert.ok(text.includes(item.q) && text.includes(item.a.slice(0, 60)), `FAQ must be visible on the page: ${item.q}`);
    // The JSON-LD answers must match the visible answers word for word (Google's FAQPage rule), and the
    // page has no numbered how-to steps, so it must not carry HowTo markup.
    const squash = (s) => s.replace(/\s+/g, ' ').trim();
    faq.mainEntity.forEach((q, i) => {
      assert.equal(q.name, TOOL_FAQ[i].q);
      assert.equal(q.acceptedAnswer.text, TOOL_FAQ[i].a);
      assert.ok(squash(text).includes(squash(q.name)) && squash(text).includes(squash(q.acceptedAnswer.text)), `full FAQ answer is visible on the page: ${q.name}`);
    });
    assert.ok(!types.includes('HowTo'), 'no HowTo markup without visible step-by-step instructions');
    assert.doesNotMatch(html, /pagead2\.googlesyndication|adsbygoogle/);
  });

  test('built sitemap lists the tool; guides and footer link to it', () => {
    assert.ok(read('sitemap.xml').includes('<loc>https://openexamhub.org/tools/clb-converter</loc>'));
    for (const rel of ['exams/tef-canada/index.html', 'exams/tcf-canada/index.html', 'exams/ielts/index.html', 'exams/celpip/index.html']) {
      assert.ok(read(rel).includes('href="/tools/clb-converter"'), `${rel} links to the tool`);
    }
    assert.ok(visibleText(read('exams/ielts/index.html')).includes('Express Entry accepts IELTS General Training only, not Academic'), 'IELTS guide card states the General Training rule');
    assert.ok(fs.readFileSync(path.join(root, 'public/llms.txt'), 'utf8').includes('IELTS, CELPIP, TEF Canada and TCF Canada to CLB (NCLC) score converter'), 'llms.txt describes the new scope');
    for (const rel of ['index.html', 'exams/tef-canada/index.html', 'blog/index.html', 'tools/clb-converter/index.html']) {
      assert.ok(read(rel).includes('href="/tools/clb-converter"'), `${rel} footer/tool link`);
    }
    assert.ok(visibleText(read('exams/ielts/index.html')).includes('Convert your IELTS scores to CLB'), 'IELTS guide has the tool card');
    assert.ok(visibleText(read('exams/celpip/index.html')).includes('Convert your CELPIP scores to CLB'), 'CELPIP guide has the tool card');
    assert.ok(visibleText(read('exams/celpip/index.html')).includes('Express Entry accepts the CELPIP-General test'), 'CELPIP guide card states the General test rule');
    for (const rel of ['exams/toefl/index.html', 'exams/delf/index.html', 'exams/goethe/index.html']) {
      assert.ok(!read(rel).includes('Convert your'), `${rel}: the tool card is only on the TEF/TCF Canada, IELTS and CELPIP guides`);
    }
    assert.ok(read('llms.txt').includes('/tools/clb-converter'));
  });
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nclb tests passed');
