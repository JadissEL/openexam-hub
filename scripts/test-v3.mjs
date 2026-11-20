// Tests for the v3 integration glue (not the pure algorithms, see test-algo.mjs):
// calendar tasks, client/server key parity, client plan maths, the migration planner and the
// nightly rollup folds. Offline, no credentials.   node scripts/test-v3.mjs
import assert from 'node:assert/strict';
import { buildSchedule, compactCalendar, expandCalendar, calendarTasks } from '../lib/algo/schedule.js';
import { quantiseProfile as serverQuantise, resourceIdFor, canonicalUrl } from '../lib/algo/keys.js';
import { quantiseProfile as clientQuantise, planDays, planProgress, currentDay, hasSchedule, overdueTasks } from '../src/lib/plan.js';
import { legacyResourceId } from '../lib/library.js';
import { normalizeUrl } from '../lib/allowlist.js';
import { planMigration } from './migrate-v3.mjs';
import { foldUsage, foldCalibration } from '../lib/routes/cron/rollup.js';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e?.stack?.split('\n').slice(0, 4).join('\n       ')}`); }
}

const RES = [
  { id: 'r1', title: 'TV5', url: 'https://apprendre.tv5monde.com/fr', skills: ['listening', 'grammar'] },
  { id: 'r2', title: 'RFI', url: 'https://francaisfacile.rfi.fr/fr/', skills: ['listening', 'reading'] },
  { id: 'r3', title: 'FEI', url: 'https://www.france-education-international.fr/test/tcf-tout-public', skills: ['exam_format', 'mock_exam'] }
];
function roadmap(days, startDaysAgo = 0) {
  const sched = buildSchedule({ exam: 'TCF', level: 'B2', days, resources: RES });
  const d = new Date(Date.now() - startDaysAgo * 864e5);
  const p = (n) => String(n).padStart(2, '0');
  return { id: `TCF-B2-${days}`, exam: 'TCF', level: 'B2', days, createdAt: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, phases: sched.phases, calendar: compactCalendar(sched.calendar, RES), verifiedResources: RES, progress: { done: {} } };
}

console.log('calendar tasks');
await test('every day has tasks, keys are unique and stable', () => {
  for (const days of [1, 2, 7, 14, 30, 60, 180]) {
    const rm = roadmap(days);
    const cal = calendarTasks(expandCalendar(rm.calendar, RES), RES);
    assert.equal(cal.length, days);
    const keys = cal.flatMap((d) => d.tasks.map((t) => t.key));
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(cal.every((d) => d.tasks.length >= 1 && d.tasks.length <= 2 && d.tasks.every((t) => /^d\d+t\d+$/.test(t.key) && t.text && t.minutes > 0)));
    assert.deepEqual(calendarTasks(expandCalendar(rm.calendar, RES), RES), cal, 'deterministic');
    assert.ok(keys.length <= 2000, 'fits the progress.done rule cap');
  }
});
await test('tasks only cite resources of the plan', () => {
  const cal = calendarTasks(expandCalendar(roadmap(30).calendar, RES), RES);
  const ids = new Set(RES.map((r) => r.id));
  assert.ok(cal.flatMap((d) => d.tasks).every((t) => !t.resourceId || ids.has(t.resourceId)));
  assert.ok(cal.flatMap((d) => d.tasks).some((t) => t.resourceId));
});

console.log('client mirror (src/lib/plan.js)');
await test('quantiseProfile: client mirror == server for 2000 random profiles', () => {
  const skills = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary', 'bogus'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 2000; i++) {
    const s = {};
    for (const k of skills) if (rnd() < 0.6) s[k] = [0.4, 0.7, 0, 1, -1, 2, NaN, rnd()][Math.floor(rnd() * 8)];
    assert.equal(clientQuantise(s), serverQuantise(s), JSON.stringify(s));
  }
  assert.equal(clientQuantise(null), null);
});
await test('planDays/currentDay/planProgress agree with the server pace model', () => {
  const rm = roadmap(20, 4);
  assert.ok(hasSchedule(rm));
  assert.equal(hasSchedule({ ...rm, calendar: rm.calendar.slice(1) }), false, 'calendar must cover every day');
  assert.equal(currentDay(rm), 5);
  const days = planDays(rm);
  const now = Math.floor(Date.now() / 1000);
  for (const d of days.filter((x) => x.day <= 5)) for (const t of d.tasks) rm.progress.done[t.key] = now - (5 - d.day) * 86400;
  const p = planProgress(rm, days);
  assert.equal(p.day, 5);
  assert.equal(p.onTrack, true);
  assert.ok(p.actualPct >= p.expectedPct - 5);
  assert.equal(overdueTasks(rm, days, 5).length, 0);
  const lazy = { ...roadmap(20, 9), progress: { done: {} } };
  const q = planProgress(lazy, planDays(lazy));
  assert.equal(q.onTrack, false);
  assert.ok(overdueTasks(lazy, planDays(lazy), 10).length > 5);
});

console.log('migration (scripts/migrate-v3.mjs)');
const PROD_SEED_URLS = [
  'https://www.france-education-international.fr/test/tcf-tout-public', 'https://apprendre.tv5monde.com/fr', 'https://francaisfacile.rfi.fr/fr/',
  'https://ielts.org', 'https://takeielts.britishcouncil.org', 'https://www.cambridgeenglish.org',
  'https://www.goethe.de/de/spr/prf.html', 'https://learngerman.dw.com', 'https://www.vhs-lernportal.de'
];
const seedDoc = (url, i) => ({ id: legacyResourceId(url), url: normalizeUrl(url), title: `Seed ${i}`, exams: [['TCF', 'IELTS', 'GOETHE'][Math.floor(i / 3)]], levels: [], approved: true, linkStatus: 'ok', lastCheckedAt: new Date('2026-11-19T10:00:00Z'), usageCount: 0 });
function applyPlan(docs, plan) {
  const m = new Map(docs.map((d) => [d.id, { ...d }]));
  for (const c of plan.copies) m.set(c.to, { ...(m.get(c.to) || {}), ...c.data, id: c.to });
  for (const [id, patch] of plan.updates) m.set(id, { ...m.get(id), ...patch });
  return [...m.values()];
}
await test('the 9 docs already seeded in prod keep their ids (no moves), only new fields are added', () => {
  const docs = PROD_SEED_URLS.map(seedDoc);
  for (const d of docs) assert.equal(d.id, resourceIdFor(canonicalUrl(d.url)), d.url);
  const plan = planMigration(docs, Date.parse('2026-11-20T00:00:00Z'));
  assert.equal(plan.copies.length, 0);
  assert.equal(plan.retired.size, 0);
  assert.equal(plan.updates.size, 9);
  for (const [, u] of plan.updates) {
    assert.ok(u.site && u.dedupKey && typeof u.tier === 'number' && u.shelfKeys.length === 6 && u.completionCount === 0 && u.consecutiveDead === 0 && u.checkIntervalDays === 14);
    assert.equal(u.nextCheckAt.toISOString(), '2026-12-03T10:00:00.000Z');
    assert.ok(!('approved' in u) && !('duplicateOf' in u));
  }
});
await test('idempotent: a second run plans nothing', () => {
  const docs = [...PROD_SEED_URLS.map(seedDoc),
    { id: 'legacyidwithquery0000000', url: 'https://learngerman.dw.com/de/overview?b=2&a=1&utm_source=x', title: 'DW overview', exams: ['GOETHE'], approved: true, linkStatus: 'ok' },
    { id: 'dupe0000000000000000000a', url: 'https://www.goethe.de/de/spr/prf.html?utm_campaign=y', title: 'Goethe exams copy', exams: ['GOETHE'], approved: true, linkStatus: 'unverified' },
    { id: legacyResourceId('https://www.goethe.de/de/spr/prf/uebersicht.html'), url: 'https://www.goethe.de/de/spr/prf/uebersicht.html', title: 'Seed 6', exams: ['GOETHE'], approved: true, linkStatus: 'unverified' }];
  const p1 = planMigration(docs);
  const goetheId = legacyResourceId('https://www.goethe.de/de/spr/prf.html');
  assert.equal(p1.copies.length, 1, 'query-string URL moves to its v3 id');
  assert.equal(p1.retired.get('dupe0000000000000000000a'), goetheId, 'tracking-param copy retired onto the existing doc');
  assert.ok(!p1.copies.some((c) => c.to === goetheId), 'existing canonical doc is never overwritten');
  assert.ok(p1.clusters.some((c) => c.keep === goetheId && c.drop.includes(legacyResourceId('https://www.goethe.de/de/spr/prf/uebersicht.html'))), 'near-duplicate title on the same site retired');
  const after = applyPlan(docs, p1);
  const p2 = planMigration(after);
  assert.equal(p2.copies.length, 0); assert.equal(p2.clusters.length, 0); assert.equal(p2.updates.size, 0, JSON.stringify([...p2.updates]));
});

console.log('rollup folds');
// Minimal admin-like fake with FieldValue.increment and atomic batches.
class Fake {
  constructor() { this.docs = new Map(); }
  ref(path) {
    const fs = this;
    return {
      id: path.split('/').pop(), path,
      collection: (n) => fs.col(`${path}/${n}`),
      async get() { const d = fs.docs.get(path); return { exists: !!d, id: path.split('/').pop(), data: () => (d ? structuredClone(d) : undefined) }; },
      async set(data, o) { fs.write(path, data, o); }
    };
  }
  write(path, data, o) {
    const prev = o?.merge ? { ...(this.docs.get(path) || {}) } : {};
    for (const [k, v] of Object.entries(data)) prev[k] = v?.constructor?.name === 'NumericIncrementTransform' ? (prev[k] || 0) + v.operand : v;
    this.docs.set(path, prev);
  }
  col(path) {
    const fs = this;
    const q = { lim: Infinity };
    const api = {
      doc: (id) => fs.ref(`${path}/${id}`),
      limit: (n) => { q.lim = n; return api; },
      async get() {
        const docs = [...fs.docs].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')).slice(0, q.lim)
          .map(([p, d]) => ({ id: p.split('/').pop(), data: () => structuredClone(d) }));
        return { docs, size: docs.length };
      }
    };
    return api;
  }
  batch() {
    const ops = [];
    return { set: (r, d, o) => ops.push(() => this.write(r.path, d, o)), delete: (r) => ops.push(() => this.docs.delete(r.path)), commit: async () => ops.forEach((f) => f()) };
  }
}
const PUBP = 'artifacts/t/public/data';
await test('foldUsage: past buckets fold into resources and are deleted; current hour is kept; re-run is a no-op', async () => {
  const fs = new Fake();
  const pub = fs.ref(PUBP);
  fs.docs.set(`${PUBP}/resources/r1`, { usageCount: 2 });
  fs.docs.set(`${PUBP}/resources/r2`, {});
  fs.docs.set(`${PUBP}/usage_buckets/3_2026010100`, { u: { r1: 3, r2: 1, gone: 5 }, c: { r1: 1 } });
  fs.docs.set(`${PUBP}/usage_buckets/4_2026010101`, { u: { r1: 1 } });
  const cur = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
  fs.docs.set(`${PUBP}/usage_buckets/5_${cur}`, { u: { r1: 100 } });
  const r = await foldUsage(fs, pub);
  assert.deepEqual(r, { folded: 2, skipped: 1, resourcesUpdated: 2 });
  assert.deepEqual(fs.docs.get(`${PUBP}/resources/r1`), { usageCount: 6, completionCount: 1 });
  assert.deepEqual(fs.docs.get(`${PUBP}/resources/r2`), { usageCount: 1 });
  assert.ok(!fs.docs.has(`${PUBP}/resources/gone`), 'deleted resources are not recreated');
  assert.ok(fs.docs.has(`${PUBP}/usage_buckets/5_${cur}`));
  const again = await foldUsage(fs, pub);
  assert.equal(again.folded, 0);
  assert.equal(fs.docs.get(`${PUBP}/resources/r1`).usageCount, 6);
});
await test('foldCalibration: b moves against the error, bounded, n accumulates', async () => {
  const fs = new Fake();
  const pub = fs.ref(PUBP);
  fs.docs.set(`${PUBP}/calib_buckets/1_TCF_B1`, { items: { B1_aaaaaaaa: { n: 10, err: 4 }, B2_bbbbbbbb: { n: 2, err: -1 }, 'bad key!': { n: 1, err: 1 } } });
  await foldCalibration(fs, pub);
  const set = fs.docs.get(`${PUBP}/item_sets/TCF_B1`);
  assert.ok(set.b.B1_aaaaaaaa < -0.5, 'easier than assumed -> b decreases');
  assert.ok(set.b.B2_bbbbbbbb > 0.5, 'harder than assumed -> b increases');
  assert.equal(set.n.B1_aaaaaaaa, 10);
  assert.ok(!('bad key!' in set.b));
  assert.ok(!fs.docs.has(`${PUBP}/calib_buckets/1_TCF_B1`));
  fs.docs.set(`${PUBP}/calib_buckets/2_TCF_B1`, { items: { B1_aaaaaaaa: { n: 1000, err: 1e6 } } });
  await foldCalibration(fs, pub);
  assert.ok(fs.docs.get(`${PUBP}/item_sets/TCF_B1`).b.B1_aaaaaaaa >= -4, 'clamped');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
