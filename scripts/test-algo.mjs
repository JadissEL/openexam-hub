// Offline tests + micro-benchmarks for lib/algo/* (pure modules: no network, no Firestore).
// Run: node scripts/test-algo.mjs
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { largestRemainder, popcount, skillMask, STUDY_SKILLS, LEVELS } from '../lib/algo/common.js';
import * as K from '../lib/algo/keys.js';
import * as R from '../lib/algo/rank.js';
import * as SC from '../lib/algo/schedule.js';
import * as SRS from '../lib/algo/srs.js';
import * as P from '../lib/algo/placement.js';
import * as PR from '../lib/algo/progress.js';
import { normalizeUrl } from '../lib/allowlist.js';
import { createLru } from '../lib/algo/lru.js';
import * as ALL from '../lib/algo/index.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const bench = {};

// Seeded PRNG (mulberry32) so fixtures are reproducible.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NOW = Date.parse('2026-11-20T10:00:00Z');
const DAY = 864e5;
const SITES = ['www.goethe.de', 'learngerman.dw.com', 'www.dw.com', 'www.vhs-lernportal.de', 'europa.eu', 'www.ielts.org', 'takeielts.britishcouncil.org', 'www.cambridgeenglish.org', 'apprendre.tv5monde.com', 'francaisfacile.rfi.fr', 'www.france-education-international.fr'];
const SK = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary', 'mock_exam', 'exam_format'];
function library(n, seed = 1) {
  const r = rng(seed);
  const exams = ['TCF', 'IELTS', 'GOETHE'];
  return Array.from({ length: n }, (_, i) => {
    const site = SITES[Math.floor(r() * SITES.length)];
    const skills = SK.filter(() => r() < 0.25);
    if (!skills.length) skills.push(SK[i % SK.length]);
    const lv = LEVELS.filter(() => r() < 0.3);
    const st = r();
    return {
      id: `res${String(i).padStart(5, '0')}`, url: `https://${site}/path/${i}`, title: `Resource ${i} ${skills.join(' ')}`,
      skills, exams: [exams[i % 3], ...(r() < 0.2 ? [exams[(i + 1) % 3]] : [])], levels: lv,
      linkStatus: st < 0.7 ? 'ok' : st < 0.9 ? 'unverified' : st < 0.95 ? 'error' : 'dead',
      lastCheckedAt: new Date(NOW - Math.floor(r() * 120) * DAY).toISOString(),
      usageCount: Math.floor(r() * 200), completionCount: 0, approved: r() > 0.05
    };
  }).map((x) => ({ ...x, completionCount: Math.floor(x.usageCount * 0.6) }));
}

// ===================================================================== common
test('largestRemainder: sums to total, respects min/max, proportional, deterministic', () => {
  const r = rng(7);
  for (let t = 0; t < 2000; t++) {
    const n = 1 + Math.floor(r() * 7);
    const w = Array.from({ length: n }, () => r());
    const total = Math.floor(r() * 200);
    const out = largestRemainder(w, total);
    assert.equal(out.reduce((a, b) => a + b, 0), total);
    const W = w.reduce((a, b) => a + b, 0);
    out.forEach((x, i) => assert.ok(Math.abs(x - (w[i] / W) * total) < 1 + 1e-9, 'quota property'));
    assert.deepEqual(out, largestRemainder(w, total));
  }
  assert.deepEqual(largestRemainder([1, 1, 1], 10, { min: [1, 1, 1], max: [2, 100, 100] }).reduce((a, b) => a + b), 10);
  assert.ok(largestRemainder([10, 1], 9, { max: [5, 9] })[0] <= 5);
  assert.deepEqual(largestRemainder([1, 2], 0), [0, 0]);
});
test('popcount / skillMask', () => {
  assert.equal(popcount(0), 0); assert.equal(popcount(0xff), 8); assert.equal(popcount(0x80000001 | 0), 2);
  assert.equal(skillMask(['listening', 'exam_format', 'nope']), 1 | (1 << 7));
});

// ===================================================================== keys
test('bucketDays: snaps to 7/14/30/60/90/180 and is monotone', () => {
  assert.equal(K.bucketDays(1), 7); assert.equal(K.bucketDays(7), 7); assert.equal(K.bucketDays(10), 14);
  assert.equal(K.bucketDays(28), 30); assert.equal(K.bucketDays(30), 30); assert.equal(K.bucketDays(45), 60);
  assert.equal(K.bucketDays(180), 180); assert.equal(K.bucketDays(999), 180);
  let prev = 0;
  for (let d = 1; d <= 180; d++) { const b = K.bucketDays(d); assert.ok(K.DAY_BUCKETS.includes(b)); assert.ok(b >= prev); prev = b; }
});
test('quantiseProfile + planKey: coarse, stable, deterministic', () => {
  assert.equal(K.quantiseProfile(null), null);
  assert.equal(K.quantiseProfile({}), null);
  assert.equal(K.quantiseProfile({ listening: 0.1, reading: 0.5, writing: 0.9 }), 'wms---');
  assert.equal(K.quantiseProfile({ listening: 0.39 }), K.quantiseProfile({ listening: 0.0 }));
  assert.equal(K.planKey({ exam: 'tcf', level: 'b2', days: 28 }), 'TCF_B2_30');
  assert.equal(K.planKey({ exam: 'TCF', level: 'B2', days: 31, skillScores: { listening: 0.2, speaking: 0.95 } }), 'TCF_B2_30_w--s--');
  assert.equal(K.planKey({ exam: 'TCF', level: 'B2', days: 30, variant: 'canada' }), 'TCF_B2_30_CANADA');
  assert.equal(K.planKey({ exam: 'TCF', level: 'B2', days: 30, variant: 'tout_public' }), 'TCF_B2_30');
  assert.equal(K.planKey({ exam: 'TEF_CANADA', level: 'B2', days: 30 }), 'TEF_CANADA_B2_30');
  assert.throws(() => K.planKey({ exam: 'x', level: 'B2', days: 3 }));
  assert.throws(() => K.planKey({ exam: 'TCF', level: 'Z9', days: 3 }));
  assert.deepEqual(K.profileToScores('w--s--'), { listening: 0.25, speaking: 0.85 });
  assert.equal(K.shelfKey('goethe', 'b1'), 'GOETHE_B1');
});
test('canonicalUrl: tracking params, ordering, case, port, slashes, fragment; idempotent; matches normalizeUrl', () => {
  assert.equal(K.canonicalUrl('https://WWW.Goethe.DE:443/de//spr/?utm_source=x&b=2&a=1&fbclid=z#top'), 'https://www.goethe.de/de/spr?a=1&b=2');
  for (const u of ['https://www.ielts.org/', 'https://www.ielts.org/take-a-test/', 'https://learngerman.dw.com/en/overview', 'https://apprendre.tv5monde.com/fr/exercices?x=1']) {
    const c = K.canonicalUrl(u);
    assert.equal(K.canonicalUrl(c), c, 'idempotent');
    if (!u.includes('?')) assert.equal(c, normalizeUrl(u), `same as normalizeUrl for ${u}`);
  }
  assert.equal(K.resourceIdFor('https://www.ielts.org/?utm_medium=a'), K.resourceIdFor('https://WWW.ielts.org'));
  assert.match(K.resourceIdFor('https://www.ielts.org'), /^[0-9a-f]{24}$/);
});
test('dedupKey: locale segments, www, index pages', () => {
  assert.equal(K.dedupKey('https://www.goethe.de/de/spr/ueb.html'), K.dedupKey('https://goethe.de/en/spr/ueb.html'));
  assert.equal(K.dedupKey('https://www.ielts.org/en-gb/prepare/index.html'), K.dedupKey('https://ielts.org/fr-FR/prepare'));
  assert.notEqual(K.dedupKey('https://www.goethe.de/de/spr/a'), K.dedupKey('https://www.goethe.de/de/spr/b'));
  assert.equal(K.isLocaleSegment('ab'), false, 'not a known language');
  assert.equal(K.isLocaleSegment('api'), false);
  assert.equal(K.siteOf('https://learngerman.dw.com/x'), 'dw.com');
  assert.equal(K.siteOf('https://www.bbc.co.uk/x'), 'bbc.co.uk');
  assert.notEqual(
    K.dedupKey('https://www.youtube.com/watch?v=9YpA3MRjLFg'),
    K.dedupKey('https://www.youtube.com/watch?v=YsFtmYT4t-E'),
    'distinct YouTube videos must not share a dedup key'
  );
  assert.equal(
    K.dedupKey('https://youtu.be/9YpA3MRjLFg'),
    K.dedupKey('https://youtu.be/9YpA3MRjLFg?feature=share')
  );
  assert.equal(
    K.canonicalUrl('https://www.youtube.com/watch?v=9YpA3MRjLFg&feature=youtu.be'),
    'https://www.youtube.com/watch?v=9YpA3MRjLFg'
  );
  assert.equal(
    K.canonicalUrl('https://www.youtube.com/@CELPIPOfficial?cbrd=1&ucbcb=1'),
    'https://www.youtube.com/@CELPIPOfficial'
  );
});
test('shingles/jaccard/isNearDuplicate', () => {
  assert.equal(K.jaccard(new Set(), new Set()), 1);
  assert.equal(K.titleSimilarity('Übungen B1', 'Ubungen  b1!'), 1);
  assert.ok(K.titleSimilarity('IELTS Listening practice test 1', 'IELTS Listening practice test 2') > 0.75);
  assert.ok(K.titleSimilarity('Deutsch lernen', 'IELTS speaking') < 0.2);
  const a = { url: 'https://www.goethe.de/de/a', title: 'Goethe-Zertifikat B1 Übungssatz' };
  assert.ok(K.isNearDuplicate(a, { url: 'https://www.goethe.de/en/a', title: 'whatever' }));
  assert.ok(K.isNearDuplicate(a, { url: 'https://www.goethe.de/de/zzz', title: 'Goethe-Zertifikat B1: Übungssatz' }));
  assert.ok(!K.isNearDuplicate(a, { url: 'https://www.dw.com/de/zzz', title: 'Goethe-Zertifikat B1 Übungssatz' }), 'other site');
});
test('findNearDuplicates: finds planted dups (LSH) and equals brute force on a small set', () => {
  const lib = library(400, 3).map((r, i) => ({ ...r, title: `Unique title number ${i} about ${r.skills[0]} for ${r.exams[0]} ${['alpha', 'beta', 'gamma', 'delta'][i % 4]}${i}` }));
  lib.push({ id: 'dupA', url: 'https://www.goethe.de/de/spr/kup/prf/prf/gzb1/ueb.html', title: 'Goethe-Zertifikat B1 Übungsmaterialien' });
  lib.push({ id: 'dupB', url: 'https://www.goethe.de/en/spr/kup/prf/prf/gzb1/ueb.html?utm_source=t', title: 'Goethe-Zertifikat B1 – practice materials' });
  lib.push({ id: 'dupC', url: 'https://www.goethe.de/de/spr/other.html', title: 'Goethe-Zertifikat B1: Übungsmaterialien' });
  const groups = K.findNearDuplicates(lib);
  const ids = groups.map((g) => g.map((i) => lib[i].id));
  assert.ok(ids.some((g) => g.includes('dupA') && g.includes('dupB') && g.includes('dupC')), JSON.stringify(ids));
  // brute force comparison
  const small = lib.slice(-60);
  const lsh = K.findNearDuplicates(small).map((g) => g.join(',')).sort();
  const parent = small.map((_, i) => i);
  const f = (x) => (parent[x] === x ? x : (parent[x] = f(parent[x])));
  for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) if (K.isNearDuplicate(small[i], small[j])) parent[Math.max(f(i), f(j))] = Math.min(f(i), f(j));
  const g = new Map(); small.forEach((_, i) => { const r = f(i); g.set(r, [...(g.get(r) || []), i]); });
  const brute = [...g.values()].filter((x) => x.length > 1).map((x) => x.join(',')).sort();
  assert.deepEqual(lsh, brute);
});

// ===================================================================== rank
const Q = { exam: 'GOETHE', level: 'B1' };
test('rank: components (level, tier, health decay, Bayesian prior, Wilson)', () => {
  assert.equal(R.levelScore(['B1'], 'B1'), 1); assert.equal(R.levelScore(['A2'], 'B1'), 0.6); assert.equal(R.levelScore([], 'B1'), 0.7);
  assert.equal(R.levelScore(['A1'], 'B1'), 0.25); assert.equal(R.levelScore(['A1'], 'C1'), 0);
  assert.equal(R.tierScore('https://www.goethe.de/x', 'GOETHE'), 1);
  assert.equal(R.tierScore('https://www.ielts.org/x', 'GOETHE'), 0.85);
  assert.equal(R.tierScore('https://learngerman.dw.com/x', 'GOETHE'), 0.75);
  assert.equal(R.tierScore('https://europa.eu/x', 'GOETHE'), 0.6);
  assert.equal(R.healthScore('dead', null, NOW), null);
  assert.ok(Math.abs(R.healthScore('ok', NOW, NOW) - 1) < 1e-9);
  assert.ok(Math.abs(R.healthScore('ok', NOW - 30 * DAY, NOW) - 0.75) < 1e-9, 'half-life 30 days');
  assert.equal(R.healthScore('ok', null, NOW), 0.5);
  assert.equal(R.bayesianRate(0, 0), 0.5, 'new items sit at the prior');
  assert.ok(R.bayesianRate(90, 100) > R.bayesianRate(9, 10));
  assert.equal(R.wilsonLowerBound(0, 0), 0);
  assert.ok(R.wilsonLowerBound(90, 100) > R.wilsonLowerBound(9, 10));
  assert.ok(R.wilsonLowerBound(5, 10) < 0.5);
});
test('rank: excludes dead, unapproved, wrong exam, far levels; exact level beats adjacent', () => {
  const base = { skills: ['listening'], exams: ['GOETHE'], linkStatus: 'ok', lastCheckedAt: NOW, usageCount: 0 };
  const res = [
    { ...base, id: 'exact', url: 'https://www.goethe.de/a', title: 'a', levels: ['B1'] },
    { ...base, id: 'adj', url: 'https://www.goethe.de/b', title: 'b', levels: ['A2'] },
    { ...base, id: 'dead', url: 'https://www.goethe.de/c', title: 'c', levels: ['B1'], linkStatus: 'dead' },
    { ...base, id: 'unapp', url: 'https://www.goethe.de/d', title: 'd', levels: ['B1'], approved: false },
    { ...base, id: 'ielts', url: 'https://www.goethe.de/e', title: 'e', levels: ['B1'], exams: ['IELTS'] },
    { ...base, id: 'far', url: 'https://www.goethe.de/f', title: 'f', levels: ['C2'] }
  ];
  const out = R.rankResources(res, { ...Q, skill: 'listening' }, { now: NOW, maxPerSite: null });
  assert.deepEqual(out.map((r) => r.id), ['exact', 'adj']);
});
test('rank: MMR + site cap spread results across sites and skills', () => {
  const res = [];
  for (let i = 0; i < 20; i++) res.push({ id: `g${i}`, url: `https://www.goethe.de/${i}`, title: `g${i}`, skills: ['listening'], exams: ['GOETHE'], levels: ['B1'], linkStatus: 'ok', lastCheckedAt: NOW });
  res.push({ id: 'dw1', url: 'https://learngerman.dw.com/1', title: 'dw', skills: ['reading'], exams: ['GOETHE'], levels: ['B1'], linkStatus: 'ok', lastCheckedAt: NOW });
  res.push({ id: 'vhs1', url: 'https://www.vhs-lernportal.de/1', title: 'vhs', skills: ['grammar'], exams: ['GOETHE'], levels: ['B1'], linkStatus: 'ok', lastCheckedAt: NOW });
  const out = R.rankResources(res, Q, { now: NOW, k: 5 });
  const sites = out.map((r) => K.siteOf(r.url));
  assert.ok(sites.includes('dw.com') && sites.includes('vhs-lernportal.de'), sites.join());
  assert.ok(sites.filter((s) => s === 'goethe.de').length <= 3);
  // cap relaxes when the library only has one site
  const only = R.rankResources(res.slice(0, 20), Q, { now: NOW, k: 6 });
  assert.equal(only.length, 6);
  assert.ok(only.some((r) => r.siteCapRelaxed));
});
test('rank: deterministic (shuffled input -> identical output) and empty library', () => {
  const lib = library(800, 11);
  const a = R.rankResources(lib, { exam: 'TCF', level: 'B2' }, { now: NOW, k: 12 });
  const r = rng(5);
  const shuffled = lib.slice().sort(() => r() - 0.5);
  const b = R.rankResources(shuffled, { exam: 'TCF', level: 'B2' }, { now: NOW, k: 12 });
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.ok(a.length === 12);
  assert.deepEqual(R.rankResources([], Q, { now: NOW }), []);
  assert.deepEqual(R.rankResources(null, Q, { now: NOW }), []);
  assert.throws(() => R.rankResources([], { exam: 'TCF', level: 'Q' }));
});
test('rank: rankForPlan guarantees coverage of weighted skills; shelfEntry is compact', () => {
  const lib = library(300, 2);
  const out = R.rankForPlan(lib, { exam: 'IELTS', level: 'B2', skillWeights: { listening: 1, reading: 1, writing: 1, speaking: 1 } }, { now: NOW, k: 6 });
  for (const s of ['listening', 'reading', 'writing', 'speaking']) assert.ok(out.some((r) => r.skills.includes(s)), s);
  const e = R.shelfEntry(out[0]);
  assert.ok(JSON.stringify(e).length < 400);
});
test('bench: rank 5,000 resources < 50 ms', () => {
  const lib = library(5000, 42);
  R.rankResources(lib, { exam: 'GOETHE', level: 'B1' }, { now: NOW, k: 12 }); // warm-up (JIT)
  const runs = 20; const t0 = performance.now();
  for (let i = 0; i < runs; i++) R.rankResources(lib, { exam: 'GOETHE', level: 'B1', skill: i % 2 ? 'listening' : null }, { now: NOW, k: 12 });
  const ms = (performance.now() - t0) / runs;
  bench['rank 5k (k=12)'] = ms;
  assert.ok(ms < 50, `${ms.toFixed(2)} ms`);
  const t1 = performance.now();
  R.rankResources(library(50000, 9), { exam: 'TCF', level: 'B2' }, { now: NOW, k: 40 });
  bench['rank 50k (k=40, incl. fixture build)'] = performance.now() - t1;
});
test('bench: findNearDuplicates 5,000 resources', () => {
  const lib = library(5000, 8);
  K.findNearDuplicates(lib); // warm-up (JIT)
  // Single-shot timing is noisy (GC / noisy neighbors). Warm up, then take the
  // best of up to 3 measured runs. 1500 ms leaves room for CPU contention
  // without hiding a multi-x regression (idle median is well under 1 s).
  const limit = 1500;
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    K.findNearDuplicates(lib);
    const ms = performance.now() - t0;
    if (ms < best) best = ms;
    if (best < limit) break;
  }
  bench['near-dup 5k (MinHash LSH)'] = best;
  assert.ok(best < limit, `${best.toFixed(2)} ms`);
});

// ===================================================================== schedule
const RES = [
  { id: 'fmt', title: 'Official exam page', skills: ['exam_format', 'mock_exam'] },
  { id: 'lis', title: 'Listening course', skills: ['listening'] },
  { id: 'rea', title: 'Reading course', skills: ['reading', 'vocabulary'] },
  { id: 'gra', title: 'Grammar trainer', skills: ['grammar'] }
];
function checkSchedule(s, days) {
  assert.equal(s.calendar.length, days);
  s.calendar.forEach((c, i) => assert.equal(c.day, i + 1));
  // phases: contiguous, 1..days, count rules, <= 10 tasks
  let cur = 1;
  for (const p of s.phases) {
    assert.equal(p.startDay, cur); assert.ok(p.endDay >= p.startDay); cur = p.endDay + 1;
    assert.ok(p.tasks.length >= 1 && p.tasks.length <= SC.MAX_TASKS_PER_PHASE, `tasks ${p.tasks.length}`);
    assert.match(p.phaseTitle, /^Days? \d+/);
    for (const t of p.tasks) assert.ok(!/https?:\/\//.test(t));
  }
  assert.equal(cur, days + 1);
  assert.ok(s.phases.length >= Math.min(3, days) && s.phases.length <= 5, `phases ${s.phases.length}`);
  // no more than 2 consecutive calendar days of the same study skill
  let run = 0; let last = null;
  for (const c of s.calendar) {
    if (c.type === 'study' && c.skill === last) run++; else run = c.type === 'study' ? 1 : 0;
    last = c.type === 'study' ? c.skill : null;
    assert.ok(run <= 2 || c.skill === 'mixed', `run of ${run} ${c.skill} at day ${c.day}`);
  }
  assert.equal(s.calendar[days - 1].type, 'taper', 'last day is a taper day');
}
test('schedule: 1 day, 2 days, 3 days, 7, 30, 180 days are valid', () => {
  for (const days of [1, 2, 3, 4, 5, 6, 7, 13, 14, 20, 21, 30, 59, 60, 90, 180]) checkSchedule(SC.buildSchedule({ exam: 'TCF', level: 'B2', days, resources: RES }), days);
  const one = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 1, resources: RES });
  assert.equal(one.phases.length, 1);
});
test('schedule: every day count 1..180 with random diagnostics passes all invariants', () => {
  const r = rng(99);
  for (let days = 1; days <= 180; days++) {
    const sc = Object.fromEntries(STUDY_SKILLS.filter(() => r() < 0.8).map((s) => [s, r()]));
    checkSchedule(SC.buildSchedule({ exam: 'GOETHE', level: 'B1', days, skillScores: sc, resources: RES }), days);
  }
});
test('schedule: mocks at ~40/70/90 %, reviews on an expanding ladder, taper before the exam', () => {
  const s = SC.buildSchedule({ exam: 'IELTS', level: 'B2', days: 30, resources: RES });
  const mocks = s.calendar.filter((c) => c.type === 'mock').map((c) => c.day);
  assert.deepEqual(mocks, [12, 21, 27]);
  const reviews = s.calendar.filter((c) => c.type === 'review').map((c) => c.day);
  const gaps = reviews.map((d, i) => d - (i ? reviews[i - 1] : 1));
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] - 1, `expanding ${gaps}`);
  assert.deepEqual(s.calendar.slice(-2).map((c) => c.type), ['taper', 'taper']);
  const long = SC.buildSchedule({ exam: 'IELTS', level: 'B2', days: 180, resources: RES });
  assert.equal(long.calendar.filter((c) => c.type === 'mock').length, 4);
  const lr = long.calendar.filter((c) => c.type === 'review').map((c) => c.day);
  for (let i = 1; i < lr.length; i++) assert.ok(lr[i] - lr[i - 1] <= SC.REVIEW_CAP + 1, 'reviews keep coming on long plans');
});
test('schedule: weak skills get more days; all-weak/all-strong are balanced; exam profile weights', () => {
  const weakL = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 60, skillScores: { listening: 0.1, reading: 0.9, writing: 0.9, speaking: 0.9, grammar: 0.9, vocabulary: 0.9 }, resources: RES });
  assert.ok(weakL.allocation.listening > weakL.allocation.reading * 1.5, JSON.stringify(weakL.allocation));
  for (const v of [0, 1]) {
    const s = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 60, skillScores: Object.fromEntries(STUDY_SKILLS.map((k) => [k, v])), resources: RES });
    assert.equal(s.allocation.listening, s.allocation.reading); assert.equal(s.allocation.writing, s.allocation.speaking);
  }
  const sw = SC.sectionWeightsFromProfile({ sections: [{ name: 'Compréhension orale', durationMinutes: 25 }, { name: 'Compréhension écrite', durationMinutes: 45 }, { name: 'Maîtrise des structures de la langue', durationMinutes: 15 }, { name: 'Expression écrite', durationMinutes: 60 }, { name: 'Expression orale', durationMinutes: 12 }] });
  assert.ok(sw.writing > sw.speaking && sw.reading > sw.listening, JSON.stringify(sw));
  assert.ok(Math.abs(Object.values(sw).reduce((a, b) => a + b, 0) - 1) < 1e-3);
  assert.deepEqual(SC.sectionWeightsFromProfile(null), SC.DEFAULT_SECTION_WEIGHTS);
  assert.deepEqual(SC.sectionWeightsFromProfile({ sections: [{ name: 'Hören', durationMinutes: 40 }] }).listening, 0.76);
});
test('official TEF Canada / TCF Canada / TOEFL / DELE blueprints and Spanish section map', async () => {
  const { officialProfile, mapExamIds, KNOWN_EXAMS, profileForPlan } = await import('../lib/exams.js');
  assert.ok(KNOWN_EXAMS.includes('TEF_CANADA') && KNOWN_EXAMS.includes('TOEFL') && KNOWN_EXAMS.includes('DELE') && KNOWN_EXAMS.includes('CELPIP'));
  assert.deepEqual(mapExamIds('DELF/DALF'), ['DELF', 'DALF']);
  assert.deepEqual(mapExamIds('tef-canada'), ['TEF_CANADA']);
  const tef = officialProfile('TEF_CANADA');
  assert.equal(tef.sections.length, 4);
  assert.equal(tef.sections.find((s) => s.skills.includes('reading')).questionCount, 40);
  assert.equal(tef.sections.find((s) => s.skills.includes('listening')).durationMinutes, 40);
  const sw = SC.sectionWeightsFromProfile(tef);
  assert.ok(sw.reading > sw.listening, 'reading (60 min) outweighs listening (40 min)');
  assert.ok(sw.writing > sw.speaking);
  assert.ok(Math.abs(sw.grammar - 0.03) < 1e-9, `grammar blend ${sw.grammar}`);
  const tcfCa = officialProfile('TCF', { variant: 'canada' });
  assert.ok(!tcfCa.sections.some((s) => /structure/i.test(s.name)));
  assert.equal(tcfCa.sections.length, 4);
  const tcfTp = officialProfile('TCF', { variant: 'tout_public' });
  assert.ok(tcfTp.sections.some((s) => /structure/i.test(s.name)));
  assert.equal(profileForPlan('TCF', { variant: 'canada', extracted: tcfTp }).notes.includes('TCF Canada'), true);
  const toefl = officialProfile('TOEFL');
  assert.equal(toefl.sections.length, 4);
  assert.ok(toefl.notes.includes('21 January 2026'));
  const celpip = officialProfile('CELPIP');
  assert.equal(celpip.sections.length, 4);
  assert.equal(celpip.sourceUrl, 'https://www.celpip.ca/test-format-scoring/');
  assert.equal(celpip.sections.find((s) => s.skills.includes('writing')).durationMinutes, 53);
  assert.equal(celpip.sections.find((s) => s.skills.includes('speaking')).questionCount, 8);
  assert.deepEqual(mapExamIds('CELPIP_G'), ['CELPIP']);

  const deleC2 = officialProfile('DELE', { level: 'C2' });
  assert.equal(deleC2.sections.length, 3);
  const swC2 = SC.sectionWeightsFromProfile(deleC2);
  assert.ok(swC2.writing > 0 && swC2.speaking > 0 && swC2.reading > 0 && swC2.listening > 0);
  const swEs = SC.sectionWeightsFromProfile({ sections: [{ name: 'Comprensión auditiva', durationMinutes: 40 }] });
  assert.ok(swEs.listening > 0.5);
});
test('schedule: single-skill weight still obeys the run rule via mixed days; empty library works', () => {
  const s = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 40, sectionWeights: { listening: 1, reading: 0, writing: 0, speaking: 0, grammar: 0, vocabulary: 0 }, resources: RES });
  checkSchedule(s, 40);
  assert.ok(s.allocation.mixed > 0);
  const e = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 14, resources: [] });
  checkSchedule(e, 14);
  assert.ok(e.calendar.every((c) => c.tasks.every((t) => t.resourceId === null)));
});
test('schedule: deterministic and resources used in rank order', () => {
  const a = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 45, skillScores: { listening: 0.3 }, resources: RES });
  const b = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 45, skillScores: { listening: 0.3 }, resources: RES });
  assert.deepEqual(a, b);
  assert.throws(() => SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 0 }));
  assert.throws(() => SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 181 }));
});
test('schedule: compact calendar round-trips and is small', () => {
  const s = SC.buildSchedule({ exam: 'GOETHE', level: 'B1', days: 180, skillScores: { speaking: 0.2 }, resources: RES });
  const codes = SC.compactCalendar(s.calendar, RES);
  assert.ok(JSON.stringify(codes).length < 2500, `${JSON.stringify(codes).length} bytes`);
  const back = SC.expandCalendar(codes, RES);
  back.forEach((b, i) => {
    const c = s.calendar[i];
    assert.equal(b.day, c.day); assert.equal(b.type, c.type); assert.equal(b.skill, c.skill); assert.equal(b.minutes, c.minutes);
    const main = c.tasks.find((t) => t.kind !== 'srs' && t.resourceId);
    assert.equal(b.resourceId, main ? main.resourceId : null);
  });
  assert.ok(s.phases[0].endDay <= 7, 'orientation capped at a week');
});
test('bench: schedule 180 days', () => {
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 180, skillScores: { listening: 0.2 }, resources: RES });
  bench['schedule 180 days'] = (performance.now() - t0) / 100;
  assert.ok(bench['schedule 180 days'] < 20);
});

// ===================================================================== srs
test('srs: retrievability is 0.9 after S days; interval(0.9) = S', () => {
  assert.ok(Math.abs(SRS.retrievabilityAt(10, 10) - 0.9) < 1e-9);
  assert.ok(Math.abs(SRS.intervalFor(10, 0.9) - 10) < 1e-9);
  assert.ok(SRS.intervalFor(10, 0.8) > SRS.intervalFor(10, 0.95));
});
test('srs: new card first intervals follow grade order; Again relearns in 10 min', () => {
  const c = SRS.newCard('w1', NOW);
  const p = SRS.previewIntervals(c, NOW);
  assert.equal(p.again, 0);
  assert.ok(p.hard <= p.good && p.good < p.easy, JSON.stringify(p));
  const again = SRS.nextReview(c, 'again', NOW);
  assert.equal(again.due, NOW + 600000);
  assert.equal(again.state, 'learning');
});
test('srs: successive Good reviews grow intervals; lapse shrinks stability, increments lapses, raises difficulty', () => {
  let c = SRS.newCard('w2', NOW); let t = NOW; const ivls = [];
  for (let i = 0; i < 6; i++) { c = SRS.nextReview(c, 3, t); ivls.push(c.interval); t = c.due; }
  for (let i = 1; i < ivls.length; i++) assert.ok(ivls[i] > ivls[i - 1] || ivls[i] === 365, ivls.join());
  assert.ok(ivls[0] >= 1 && ivls[1] > ivls[0] * 2, 'early growth');
  const before = c;
  const lapsed = SRS.nextReview(c, 1, t);
  assert.ok(lapsed.stability < before.stability);
  assert.equal(lapsed.lapses, before.lapses + 1);
  assert.ok(lapsed.difficulty > before.difficulty);
  assert.ok(lapsed.difficulty <= 10 && lapsed.difficulty >= 1);
  const easy = SRS.nextReview(before, 4, t); const hard = SRS.nextReview(before, 2, t);
  assert.ok(easy.stability > hard.stability && easy.interval >= hard.interval);
  assert.ok(SRS.nextReview(before, 3, t, { maximumInterval: 30 }).interval <= 30);
});
test('srs: pure (no mutation), deterministic fuzz, grade parsing, queue + retention', () => {
  const c = SRS.newCard('w3', NOW);
  const copy = JSON.stringify(c);
  SRS.nextReview(c, 3, NOW);
  assert.equal(JSON.stringify(c), copy);
  let x = SRS.nextReview(c, 3, NOW); x = SRS.nextReview(x, 3, x.due); x = SRS.nextReview(x, 3, x.due);
  assert.equal(SRS.nextReview(x, 3, x.due, { fuzz: true }).interval, SRS.nextReview(x, 3, x.due, { fuzz: true }).interval);
  assert.throws(() => SRS.nextReview(c, 5, NOW));
  assert.equal(SRS.gradeFromAnswer({ correct: false }), 1);
  assert.equal(SRS.gradeFromAnswer({ correct: true, confident: false }), 2);
  assert.equal(SRS.gradeFromAnswer({ correct: true, ms: 1000 }), 4);
  const cards = [{ ...SRS.nextReview(SRS.newCard('a', NOW - 30 * DAY), 3, NOW - 30 * DAY), skill: 'vocabulary' }, { ...SRS.nextReview(SRS.newCard('b', NOW - 3 * DAY), 3, NOW - 3 * DAY), skill: 'grammar' }, SRS.newCard('n1', NOW)];
  const q = SRS.dueQueue(cards, NOW);
  assert.equal(q[0].id, 'a', 'most forgotten first'); assert.equal(q[q.length - 1].id, 'n1');
  const ret = SRS.retention(cards, NOW);
  assert.ok(ret.bySkill.vocabulary < ret.bySkill.grammar && ret.reviewed === 2);
  assert.equal(SRS.retention([], NOW).overall, null);
});
test('bench: FSRS 100k reviews', () => {
  let c = SRS.newCard('b', NOW); const t0 = performance.now();
  for (let i = 0; i < 100000; i++) c = SRS.nextReview(i % 50 === 0 ? SRS.newCard('b', NOW) : c, (i % 4) + 1, NOW + i * 1000);
  bench['FSRS 100k nextReview'] = performance.now() - t0;
});

// ===================================================================== placement
function bankFor(perLevelPerSkill = 3) {
  const out = [];
  for (const s of STUDY_SKILLS) for (const l of LEVELS) for (let i = 0; i < perLevelPerSkill; i++) out.push({ id: `${s}-${l}-${i}`, skill: s, cefr: l });
  return out;
}
function simulate(trueTheta, targetLevel, seed, opts = {}) {
  const r = rng(seed); const bank = bankFor();
  let s = P.createSession({ targetLevel, seed: String(seed), ...opts });
  for (let guard = 0; guard < 100; guard++) {
    const it = P.nextItem(s, bank); if (!it) break;
    s = P.recordAnswer(s, it, r() < P.pCorrect(trueTheta, P.difficultyOf(it)));
  }
  return { s, rep: P.report(s) };
}
test('placement: scale mapping and information peak', () => {
  assert.equal(P.thetaToLevel(-2.5), 'A1'); assert.equal(P.thetaToLevel(0.4), 'B2'); assert.equal(P.thetaToLevel(-3.5), 'pre-A1'); assert.equal(P.thetaToLevel(5), 'C2');
  const I0 = P.information(0, 0, 0); assert.ok(Math.abs(I0 - 0.25) < 1e-9, 'Rasch info p(1-p)');
  assert.ok(P.information(0, 0) > P.information(0, 2) && P.information(0, 0) > P.information(0, -2));
});
test('placement: EAP is finite for all-correct / all-wrong and SE shrinks with more items', () => {
  const allRight = P.eap(Array.from({ length: 10 }, () => ({ b: 0.5, correct: true })), { priorMean: 0.5 });
  const allWrong = P.eap(Array.from({ length: 10 }, () => ({ b: 0.5, correct: false })), { priorMean: 0.5 });
  assert.ok(Number.isFinite(allRight.theta) && allRight.theta > 1.5);
  assert.ok(Number.isFinite(allWrong.theta) && allWrong.theta < -0.5);
  const few = P.eap([{ b: 0, correct: true }, { b: 0, correct: false }]);
  const many = P.eap(Array.from({ length: 20 }, (_, i) => ({ b: 0, correct: i % 2 === 0 })));
  assert.ok(many.se < few.se);
});
test('placement: adaptive session stops by SE or at 15 items, covers all skills, recovers ability', () => {
  let err = 0; let n = 0;
  for (const [theta, lv] of [[-2.5, 'A1'], [-0.5, 'B1'], [0.5, 'B2'], [1.5, 'C1'], [2.5, 'C2']]) {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, rep } = simulate(theta, 'B1', seed * 31 + Math.round(theta * 10));
      assert.ok(s.responses.length <= 15);
      assert.ok(['se_target', 'max_items'].includes(s.stopReason), s.stopReason);
      for (const sk of STUDY_SKILLS) assert.ok(s.responses.some((r) => r.skill === sk), 'content balance');
      err += Math.abs(rep.theta - theta); n++;
      void lv;
    }
  }
  assert.ok(err / n < 0.75, `mean abs error ${(err / n).toFixed(3)} logits`);
});
test('placement: item selection targets current ability; deterministic; no repeats', () => {
  const bank = bankFor();
  const s0 = P.createSession({ targetLevel: 'C1', seed: 'x' });
  const first = P.nextItem(s0, bank);
  assert.equal(first.cefr, 'C1', 'first item at the prior (target level)');
  assert.deepEqual(P.nextItem(s0, bank), first);
  const a = simulate(0, 'B2', 5).s.responses.map((r) => r.id);
  const b = simulate(0, 'B2', 5).s.responses.map((r) => r.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
  const s1 = P.recordAnswer(s0, first, true);
  assert.equal(P.recordAnswer(s1, first, false), s1, 'duplicate answers ignored');
  assert.throws(() => P.recordAnswer(s0, first, 'yes'));
});
test('placement: fixed 12-question mode (compatible output) and Elo calibration', () => {
  const answers = [];
  for (const s of STUDY_SKILLS) { answers.push({ id: `${s}1`, skill: s, cefr: 'B1', correct: true }); answers.push({ id: `${s}2`, skill: s, cefr: 'B2', correct: s !== 'speaking' }); }
  const rep = P.scoreFixed({ targetLevel: 'B1', answers });
  assert.equal(rep.method, 'irt_eap');
  assert.equal(Object.keys(rep.skillScores).length, 6);
  assert.ok(rep.skillScores.speaking < rep.skillScores.reading);
  assert.ok(LEVELS.includes(rep.estimatedLevel) || rep.estimatedLevel === 'pre-A1');
  assert.ok(rep.confidence > 0 && rep.confidence <= 1);
  // Elo: an item everyone gets right becomes easier; K decays
  let it = { b: 1, n: 0 };
  for (let i = 0; i < 200; i++) { const u = P.eloUpdate({ theta: 1, b: it.b, n: it.n, correct: true }); it = { b: u.b, n: u.n }; }
  assert.ok(it.b < 0, `b ${it.b}`);
  const k1 = Math.abs(P.eloUpdate({ theta: 0, b: 0, n: 0, correct: true }).b);
  const k2 = Math.abs(P.eloUpdate({ theta: 0, b: 0, n: 100, correct: true }).b);
  assert.ok(k2 < k1);
});
test('bench: adaptive placement session (15 items, 108-item bank)', () => {
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) simulate(0.3, 'B1', i);
  bench['placement session'] = (performance.now() - t0) / 20;
  assert.ok(bench['placement session'] < 50);
});

// ===================================================================== progress
const START = '2026-11-01';
const startMs = Date.parse(`${START}T00:00:00Z`);
const at = (day, h = 12) => startMs + (day - 1) * DAY + h * 3600e3;
test('progress: ewma + daily counts', () => {
  assert.equal(PR.ewma([]), 0);
  assert.equal(PR.ewma([2, 2, 2]), 2);
  assert.ok(PR.ewma([0, 0, 0, 0, 4], { seed: 0 }) > PR.ewma([4, 0, 0, 0, 0], { seed: 0 }), 'recent days weigh more');
  assert.deepEqual(PR.dailyCounts([at(1), at(1), at(3), at(99)], startMs, 3), [2, 0, 1]);
});
test('progress: on schedule, ahead, behind; projected finish; completed plan', () => {
  const total = 60; const days = 30;
  const onSched = Array.from({ length: 20 }, (_, i) => at(Math.floor(i / 2) + 1));
  const a = PR.assessProgress({ days, startDate: START, now: at(10, 18), totalTasks: total, completedAt: onSched });
  assert.equal(a.onTrack, true); assert.equal(a.day, 10);
  assert.ok(Math.abs(a.pace - 2) < 0.3, `pace ${a.pace}`);
  assert.ok(Math.abs(a.projectedFinishDay - 30) <= 2, `finish ${a.projectedFinishDay}`);
  const behind = PR.assessProgress({ days, startDate: START, now: at(15), totalTasks: total, completedAt: onSched.slice(0, 6) });
  assert.equal(behind.onTrack, false); assert.ok(behind.gapPct < -15); assert.ok(behind.requiredPace > behind.plannedPace);
  const done = PR.assessProgress({ days, startDate: START, now: at(12), totalTasks: 3, completedAt: [at(1), at(2), at(3)] });
  assert.equal(done.onTrack, true); assert.equal(done.remaining, 0);
  const stalled = PR.assessProgress({ days: 10, startDate: START, now: at(60), totalTasks: 10, completedAt: [] });
  assert.equal(stalled.projectedFinishDay, null); assert.equal(stalled.onTrack, false);
});
test('progress: far-off projections are capped (no 2029 dates), "more than N months behind" instead', () => {
  // 200 tasks over 30 days, only 3 done in 20 days -> pace ~0.15/day -> finish years away.
  const slow = PR.assessProgress({ days: 30, startDate: START, now: at(20), totalTasks: 200, completedAt: [at(2), at(9), at(18)] });
  assert.equal(slow.projectedFinishDate, null);
  assert.equal(slow.projectionCapped, true);
  assert.ok(slow.behindMonths >= 2, `months ${slow.behindMonths}`);
  assert.match(slow.behindText, /^more than \d+ months behind at this pace$/);
  const near = PR.assessProgress({ days: 30, startDate: START, now: at(10, 18), totalTasks: 60, completedAt: Array.from({ length: 20 }, (_, i) => at(Math.floor(i / 2) + 1)) });
  assert.equal(near.projectionCapped, false); assert.ok(near.projectedFinishDate); assert.equal(near.behindText, null);
});
test('progress: hysteresis prevents flip-flop around the threshold', () => {
  const total = 100; const days = 50; const day = 21;
  // ~10 points behind on share, but a strong recent pace (3/day in the last 7 days) so the projection is on time.
  const n = Math.round(((day - 0.5) / days) * total - 10);
  const recent = Array.from({ length: 21 }, (_, i) => at(day - 6 + Math.floor(i / 3)));
  const early = Array.from({ length: n - 21 }, (_, i) => at(1 + (i % (day - 7))));
  const completedAt = [...early, ...recent];
  const fromOn = PR.assessProgress({ days, startDate: START, now: at(day), totalTasks: total, completedAt, previous: { onTrack: true } });
  const fromOff = PR.assessProgress({ days, startDate: START, now: at(day), totalTasks: total, completedAt, previous: { onTrack: false } });
  assert.ok(fromOn.gapPct < -5 && fromOn.gapPct > -15, `gap ${fromOn.gapPct}`);
  assert.ok(fromOn.lateByDays <= 0, `late ${fromOn.lateByDays}`);
  assert.equal(fromOn.onTrack, true); assert.equal(fromOff.onTrack, false); assert.equal(fromOff.changed, false);
  // Catching up past the exit threshold flips it back.
  const caught = PR.assessProgress({ days, startDate: START, now: at(day), totalTasks: total, completedAt: [...completedAt, ...Array.from({ length: 8 }, () => at(day))], previous: { onTrack: false } });
  assert.equal(caught.onTrack, true); assert.equal(caught.changed, true);
});
test('progress: expected share follows the calendar; readiness blends components', () => {
  const s = SC.buildSchedule({ exam: 'TCF', level: 'B2', days: 10, resources: RES });
  const e = PR.expectedShare(5, 10, s.calendar);
  assert.ok(e > 0 && e < 1);
  assert.equal(PR.expectedShare(0, 10, s.calendar), 0); assert.equal(PR.expectedShare(10, 10, s.calendar), 1);
  const rd = PR.readinessScores({ abilityScores: { listening: 0.2, reading: 0.9 }, bySkill: { listening: { planned: 10, done: 2 }, reading: { planned: 10, done: 10 } }, retentionBySkill: { reading: 0.95 }, sectionWeights: { listening: 0.5, reading: 0.5 } });
  assert.ok(rd.perSkill.listening < rd.perSkill.reading);
  assert.deepEqual(rd.weakest[0], 'listening');
  assert.ok(rd.overall > rd.perSkill.listening && rd.overall < rd.perSkill.reading);
  assert.deepEqual(PR.readinessScores({}), { perSkill: {}, overall: null, weakest: [] });
});


// ===================================================================== lru + link scheduling + barrel
test('lru: eviction order, TTL, single-flight wrap', async () => {
  let t = 0; const c = createLru({ max: 2, ttlMs: 100, now: () => t });
  c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3);
  assert.equal(c.get('b'), undefined, 'least recently used evicted'); assert.equal(c.get('a'), 1);
  t = 200; assert.equal(c.get('a'), undefined, 'expired');
  let loads = 0; const loader = async () => { loads++; await new Promise((r) => setTimeout(r, 5)); return 42; };
  const [x, y] = await Promise.all([c.wrap('k', loader), c.wrap('k', loader)]);
  assert.equal(x, 42); assert.equal(y, 42); assert.equal(loads, 1);
  await assert.rejects(c.wrap('bad', async () => { throw new Error('boom'); }));
  assert.equal(c.get('bad'), undefined, 'failed loads are not cached');
});
test('nextLinkCheckAt: backoff, caps, deterministic jitter', () => {
  const a = R.nextLinkCheckAt({ id: 'x', status: 'ok', prevIntervalDays: 7, now: NOW });
  assert.equal(a.checkIntervalDays, 14);
  assert.equal(R.nextLinkCheckAt({ id: 'x', status: 'ok', prevIntervalDays: 30, now: NOW }).checkIntervalDays, 30);
  assert.equal(R.nextLinkCheckAt({ id: 'x', status: 'error', prevIntervalDays: 4, now: NOW }).checkIntervalDays, 7);
  assert.equal(R.nextLinkCheckAt({ id: 'x', status: 'dead', now: NOW }).checkIntervalDays, 1);
  assert.deepEqual(R.nextLinkCheckAt({ id: 'x', status: 'ok', prevIntervalDays: 7, now: NOW }), a);
  const spread = new Set(Array.from({ length: 50 }, (_, i) => R.nextLinkCheckAt({ id: `r${i}`, status: 'ok', prevIntervalDays: 7, now: NOW }).nextCheckAt));
  assert.ok(spread.size > 40, 'jitter spreads load');
  for (const v of spread) assert.ok(Math.abs(v - NOW - 14 * DAY) <= 1.4 * DAY + 1);
});
test('barrel exports every module; algo modules other than keys.js have no node: imports (browser-safe)', async () => {
  for (const k of ['common', 'keys', 'rank', 'schedule', 'srs', 'placement', 'progress', 'lru']) assert.ok(ALL[k], k);
  const { readFileSync } = await import('node:fs');
  for (const f of ['common', 'rank', 'schedule', 'srs', 'placement', 'progress', 'lru']) {
    const src = readFileSync(new URL(`../lib/algo/${f}.js`, import.meta.url), 'utf8');
    assert.ok(!/from 'node:/.test(src), `${f}.js imports node:`);
    assert.ok(!/from '\.\/keys\.js'/.test(src), `${f}.js imports keys.js (node:crypto)`);
    assert.ok(!/Math\.random/.test(src), `${f}.js uses Math.random`);
  }
});

// ------------------------------------------------------------ runner
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok   - ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL - ${t.name}\n       ${err.stack?.split('\n').slice(0, 4).join('\n       ')}`);
  }
}
console.log('\nbenchmarks (ms, this box):');
for (const [k, v] of Object.entries(bench)) console.log(`  ${k.padEnd(40)} ${v.toFixed(2)}`);
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
