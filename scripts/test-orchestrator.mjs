// Offline tests for the roadmap pipeline. No network, no Firebase credentials.
//   node scripts/test-orchestrator.mjs
// Stubs: lib/firebaseAdmin.js -> in-memory Firestore (via a module-resolve hook), global fetch ->
// scripted web pages + a scripted OpenAI-compatible LLM endpoint.
import { register } from 'node:module';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------- in-memory Firestore
const TS = (ms = Date.now()) => ({ toMillis: () => ms, toDate: () => new Date(ms), _ts: true });
class FakeDb {
  constructor() { this.docs = new Map(); }
  pub() { return new DocRef(this, 'artifacts/test-app/public/data'); }
  collection(n) { return new ColRef(this, n); }
}
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object;
function apply(prev, v) {
  const k = v?.constructor?.name;
  if (k === 'NumericIncrementTransform') return (typeof prev === 'number' ? prev : 0) + v.operand;
  if (k === 'ArrayUnionTransform') return [...new Set([...(Array.isArray(prev) ? prev : []), ...v.elements])];
  if (k === 'ServerTimestampTransform') return TS();
  return v;
}
function mergeInto(target, data, merge) {
  const out = merge ? { ...(target || {}) } : {};
  for (const [key, v] of Object.entries(data)) {
    out[key] = isPlain(v) ? mergeInto(merge ? out[key] : undefined, v, merge) : apply(out[key], v);
  }
  return out;
}
class DocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(n) { return new ColRef(this.db, `${this.path}/${n}`); }
  async get() { const d = this.db.docs.get(this.path); return { exists: !!d, id: this.id, ref: this, data: () => (d ? structuredClone(d) : undefined) }; }
  async set(data, opts = {}) { this.db.docs.set(this.path, mergeInto(this.db.docs.get(this.path), data, !!opts.merge)); }
  async create(data) {
    if (this.db.docs.has(this.path)) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
    this.db.docs.set(this.path, mergeInto(undefined, data, false));
  }
  async update(data) {
    if (!this.db.docs.has(this.path)) { const e = new Error('NOT_FOUND'); e.code = 5; throw e; }
    this.db.docs.set(this.path, mergeInto(this.db.docs.get(this.path), data, true));
  }
  async delete() { this.db.docs.delete(this.path); }
  async listCollections() { return []; }
}
const cmp = (a, b) => (a?.toMillis ? a.toMillis() : a) < (b?.toMillis ? b.toMillis() : b) ? -1 : (a?.toMillis ? a.toMillis() : a) > (b?.toMillis ? b.toMillis() : b) ? 1 : 0;
const OPS = {
  '==': (x, v) => JSON.stringify(x) === JSON.stringify(v),
  '!=': (x, v) => x !== undefined && JSON.stringify(x) !== JSON.stringify(v),
  in: (x, v) => v.some((y) => JSON.stringify(y) === JSON.stringify(x)),
  'array-contains': (x, v) => Array.isArray(x) && x.includes(v),
  'array-contains-any': (x, v) => Array.isArray(x) && x.some((y) => v.includes(y)),
  '<': (x, v) => x != null && cmp(x, v) < 0,
  '<=': (x, v) => x != null && cmp(x, v) <= 0,
  '>': (x, v) => x != null && cmp(x, v) > 0,
  '>=': (x, v) => x != null && cmp(x, v) >= 0
};
const field = (d, f) => String(f).split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
class ColRef {
  constructor(db, path, filters = [], lim = Infinity, order = []) { Object.assign(this, { db, path, filters, lim, order }); }
  doc(id) { return new DocRef(this.db, `${this.path}/${id ?? Math.random().toString(36).slice(2, 12)}`); }
  where(f, op, v) { return new ColRef(this.db, this.path, [...this.filters, [f, op, v]], this.lim, this.order); }
  limit(n) { return new ColRef(this.db, this.path, this.filters, n, this.order); }
  orderBy(f, dir = 'asc') { return new ColRef(this.db, this.path, this.filters, this.lim, [...this.order, [f, dir]]); }
  select() { return this; }
  count() { return { get: async () => { const s = await this.limit(Infinity).get(); return { data: () => ({ count: s.size }) }; } }; }
  async listDocuments() { return (await this.get()).docs.map((d) => d.ref); }
  async get() {
    let rows = [];
    for (const [p, d] of this.db.docs) {
      if (!p.startsWith(`${this.path}/`) || p.slice(this.path.length + 1).includes('/')) continue;
      if (this.filters.every(([f, op, v]) => OPS[op] && OPS[op](field(d, f), v))) rows.push([p, d]);
    }
    for (const [f] of this.order) rows = rows.filter(([, d]) => field(d, f) !== undefined); // Firestore drops docs missing the field
    if (this.order.length) rows.sort(([, a], [, b]) => { for (const [f, dir] of this.order) { const c = cmp(field(a, f), field(b, f)); if (c) return dir === 'desc' ? -c : c; } return 0; });
    const docs = rows.slice(0, this.lim).map(([p, d]) => ({ id: p.split('/').pop(), ref: new DocRef(this.db, p), exists: true, data: () => structuredClone(d) }));
    return { docs, empty: !docs.length, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
}
FakeDb.prototype.batch = function batch() {
  const ops = [];
  return {
    set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
    update: (ref, data) => ops.push(() => ref.update(data)),
    delete: (ref) => ops.push(() => ref.delete()),
    create: (ref, data) => ops.push(() => ref.create(data)),
    commit: async () => { for (const op of ops) await op(); }
  };
};
FakeDb.prototype.doc = function doc(path) { return new DocRef(this, path); };
// structuredClone drops functions on fake timestamps; keep them as plain objects with millis.
const origClone = globalThis.structuredClone;
globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && x._ts ? { _ms: x.toMillis() } : x)), (k, x) => (x && x._ms != null ? TS(x._ms) : x));
void origClone;
globalThis.__fakeDb = new FakeDb();

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.endsWith('/firebaseAdmin.js')) {
    return { url: 'data:text/javascript,' + encodeURIComponent("export const db = globalThis.__fakeDb; export const APP_ID = 'test-app'; export const pub = () => globalThis.__fakeDb.pub();"), shortCircuit: true };
  }
  return next(spec, ctx);
}`)
);

// ---------------------------------------------------------------- fetch stub
process.env.LLM_BASE_URL = 'http://llm.test/v1';
process.env.LLM_API_KEY = 'test';
const web = new Map(); // url -> (method) => {status, headers?, body?}
const llm = {}; // agent -> (body) => data | {httpStatus}
let fetchLog = [];
const page = (body, status = 200, headers = {}) => () => ({ status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body });
const longText = (s) => `<html><head><title>${s}</title></head><body><main>${`<p>${s} — free lessons and exercises for learners. </p>`.repeat(40)}</main></body></html>`;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  fetchLog.push(`${opts.method || 'GET'} ${u}`);
  if (u.startsWith('http://llm.test/')) {
    const body = JSON.parse(opts.body);
    const agent = body.response_format.json_schema.name.replace('_output', '');
    const out = llm[agent] ? llm[agent](body) : { httpStatus: 400 };
    if (out.httpStatus) return new Response('{}', { status: out.httpStatus });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, model: 'stub' }), { status: 200 });
  }
  const h = web.get(u) || web.get(u.replace(/\/$/, ''));
  if (!h) { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; }
  const r = h(opts.method || 'GET');
  return new Response(opts.method === 'HEAD' ? null : r.body ?? '', { status: r.status, headers: r.headers || {} });
};

// ---------------------------------------------------------------- tiny runner
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); } catch (err) { failed++; console.log(`  FAIL ${name}\n       ${err?.stack?.split('\n').slice(0, 3).join('\n       ')}`); }
}

const { validateInput, InputError, generateRoadmap, saveToLibrary } = await import('../lib/orchestrator.js');
const P = await import('../lib/agents/planner.js');
const A = await import('../lib/agents/copyrightAuditor.js');
const D = await import('../lib/agents/discovery.js');
const F = await import('../lib/agents/examFormat.js');

console.log('validation');
await test('rejects bad inputs with InputError', () => {
  for (const b of [null, [], {}, { exam: 'tcf', level: 'Z9', days: 30 }, { exam: 'TCF', level: 'B2', days: 0 }, { exam: 'TCF', level: 'B2', days: 181 },
    { exam: 'TCF', level: 'B2', days: 1.5 }, { exam: '<script>', level: 'B2', days: 10 }, { exam: 'TCF', level: 'B2', days: 10, forceRefresh: 'yes' },
    { exam: 'TCF', level: 'B2', days: 10, diagnostic: { skillScores: { listening: 1.2 } } }, { exam: 'TCF', level: 'B2', days: 10, diagnostic: { skillScores: { hacking: 0.5 } } },
    { exam: 'TCF', level: 'B2', days: 10, diagnostic: {} }]) {
    assert.throws(() => validateInput(b), InputError, JSON.stringify(b));
  }
});
await test('normalises good input', () => {
  const v = validateInput({ exam: ' tcf ', level: 'b2', days: '30', diagnostic: { skillScores: { speaking: 0.2 } } });
  assert.deepEqual(v, { exam: 'TCF', knownExam: true, level: 'B2', days: 30, forceRefresh: false, skillScores: { speaking: 0.2 }, variant: 'tout_public' });
});

console.log('planner repair');
const RES = [{ id: 'a', title: 'TV5Monde', url: 'https://apprendre.tv5monde.com/fr', skills: ['listening'] }, { id: 'b', title: 'RFI', url: 'https://francaisfacile.rfi.fr/fr', skills: ['listening'] }, { id: 'c', title: 'FEI TCF', url: 'https://www.france-education-international.fr/test/tcf-tout-public', skills: ['exam_format', 'mock_exam'] }];
await test('strips URLs, resolves [R#], removes unknown refs', () => {
  const plan = P.repairPlan({ summary: 'See https://evil.example.com/x and [R1].', phases: [
    { phaseTitle: 'Days 1-5: Start', focus: 'f', startDay: 1, endDay: 5, tasks: ['Watch [R1] at https://apprendre.tv5monde.com/fr/videos daily', 'Use [R9] now', 'Try [R2, R3] and www.foo.com', 'Open ielts.org/practice'] },
    { phaseTitle: 'Middle', focus: 'f', startDay: 6, endDay: 10, tasks: ['https://only-a-url.com'] },
    { phaseTitle: 'End', focus: 'f', startDay: 11, endDay: 14, tasks: ['Mock with [R3]'] }] }, { days: 14, resources: RES });
  assert.deepEqual(P.checkPlan(plan, 14), []);
  const t = plan.phases[0].tasks;
  assert.equal(t[0], 'Watch “TV5Monde” at daily');
  assert.equal(t[1], 'Use now');
  assert.equal(t[2], 'Try “RFI”, “FEI TCF” and');
  assert.equal(t[3], 'Open');
  assert.equal(plan.phases[1].tasks[0], 'Review and consolidate the previous phase’s material.');
  assert.equal(plan.phases[0].phaseTitle, 'Days 1–5: Start');
  assert.ok(!/https?:/.test(plan.summary) && plan.summary.includes('“TV5Monde”'));
  assert.equal(plan.repairs.unknownRefs, 1);
  assert.ok(plan.repairs.urlsStripped >= 4);
  assert.equal(plan.repairs.rangesRepaired, false);
});
await test('repairs gaps/overlaps so ranges cover 1..days', () => {
  const plan = P.repairPlan({ summary: '', phases: [
    { phaseTitle: 'A', startDay: 1, endDay: 10, tasks: ['x x x'] }, { phaseTitle: 'B', startDay: 15, endDay: 18, tasks: ['y y y'] }, { phaseTitle: 'C', startDay: 12, endDay: 40, tasks: ['z z z'] }] }, { days: 30, resources: RES });
  assert.deepEqual(P.checkPlan(plan, 30), []);
  assert.equal(plan.repairs.rangesRepaired, true);
  assert.equal(plan.phases[0].startDay, 1);
  assert.equal(plan.phases.at(-1).endDay, 30);
});
await test('merges >5 phases and splits <3 phases', () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ phaseTitle: `P${i}`, startDay: i * 4 + 1, endDay: i * 4 + 4, tasks: [`task ${i}`] }));
  const a = P.repairPlan({ summary: '', phases: seven }, { days: 28, resources: RES });
  assert.equal(a.phases.length, 5); assert.equal(a.repairs.phasesMerged, 2); assert.deepEqual(P.checkPlan(a, 28), []);
  assert.equal(a.phases[4].endDay, 28);
  const one = P.repairPlan({ summary: '', phases: [{ phaseTitle: 'All', startDay: 1, endDay: 30, tasks: ['t1 a', 't2 b', 't3 c', 't4 d'] }] }, { days: 30, resources: RES });
  assert.equal(one.phases.length, 3); assert.deepEqual(P.checkPlan(one, 30), []);
});
await test('random ranges always repaired to exact cover (days 1..180)', () => {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  for (let k = 0; k < 2000; k++) {
    const days = 1 + rnd(180);
    const n = 1 + rnd(7);
    const phases = Array.from({ length: n }, () => ({ phaseTitle: 'p', startDay: rnd(3) ? rnd(200) - 5 : null, endDay: rnd(3) ? rnd(200) - 5 : 'x', tasks: ['do it'] }));
    const plan = P.repairPlan({ summary: '', phases }, { days, resources: RES });
    assert.deepEqual(P.checkPlan(plan, days), [], `days=${days} n=${n}`);
  }
});
await test('fallback plan is valid and cites only given resources', () => {
  for (const days of [1, 2, 3, 30, 180]) {
    const plan = P.buildFallbackPlan({ exam: 'TCF', level: 'B2', days, resources: RES, skillScores: { speaking: 0.1, reading: 0.9 } });
    assert.deepEqual(P.checkPlan(plan, days), [], `days=${days}`);
  }
});

console.log('copyright auditor');
web.set('https://apprendre.tv5monde.com/fr', page(longText('TV5Monde Apprendre')));
web.set('https://francaisfacile.rfi.fr/fr', page(longText('RFI Français facile')));
web.set('https://www.france-education-international.fr/test/tcf-tout-public', page(longText('TCF tout public')));
web.set('https://ielts.org/dead', page('', 404));
web.set('https://ielts.org/blocked', page('', 403));
web.set('https://ielts.org/paywall', page(`<html><body>${'<p>Intro text. </p>'.repeat(50)}<div>Subscribe to continue reading</div></body></html>`));
web.set('https://ielts.org/loginform', page('<html><body><form><input name=u><input type="password"></form></body></html>'));
web.set('https://ielts.org/redir-login', page('', 302, { location: '/account/login?next=/x' }));
web.set('https://ielts.org/account/login?next=/x', page(longText('Login')));
web.set('https://ielts.org/redir-out', page('', 302, { location: 'https://evil.example.com/' }));
web.set('https://learngerman.dw.com', (m) => (m === 'HEAD' ? { status: 302, headers: { location: '/en/user/feedback/status/OTHER' } } : { status: 302, headers: { location: '/en/learn-german/s-9528' } }));
web.set('https://learngerman.dw.com/en/user/feedback/status/OTHER', page('feedback'));
web.set('https://learngerman.dw.com/en/learn-german/s-9528', page(longText('LEARN GERMAN')));
web.set('https://www.goethe.de/soft404', page('<html><head><title>Seite nicht gefunden</title></head><body>x</body></html>'));
await test('allowlist, link status, paywall, login wall, redirects, soft-404', async () => {
  fetchLog = [];
  const { passed, rejected } = await A.auditResources([
    { url: 'https://evil.example.com/free', title: 'x' },
    { url: 'https://ielts.org/dead', title: 'x' },
    { url: 'https://ielts.org/blocked', title: 'Blocked' },
    { url: 'https://ielts.org/paywall', title: 'x' },
    { url: 'https://ielts.org/loginform', title: 'x' },
    { url: 'https://ielts.org/redir-login', title: 'x' },
    { url: 'https://ielts.org/redir-out', title: 'x' },
    { url: 'https://learngerman.dw.com', title: 'DW' },
    { url: 'https://www.goethe.de/soft404', title: 'x' },
    { url: 'https://apprendre.tv5monde.com/fr', title: 'TV5' }
  ]);
  assert.ok(!fetchLog.some((l) => l.includes('evil.example.com/free')), 'off-allowlist URL must not be fetched');
  const why = Object.fromEntries(rejected.map((r) => [r.url, r.reason]));
  assert.match(why['https://evil.example.com/free'], /allowlist/);
  assert.match(why['https://ielts.org/dead'], /dead/);
  assert.match(why['https://ielts.org/paywall'], /paywall/);
  assert.match(why['https://ielts.org/loginform'], /login form/);
  assert.match(why['https://ielts.org/redir-login'], /login/);
  assert.match(why['https://ielts.org/redir-out'], /off_allowlist/);
  assert.match(why['https://www.goethe.de/soft404'], /soft 404/);
  const byUrl = Object.fromEntries(passed.map((p) => [p.url, p]));
  assert.deepEqual(Object.keys(byUrl).sort(), ['https://apprendre.tv5monde.com/fr', 'https://ielts.org/blocked', 'https://learngerman.dw.com/en/learn-german/s-9528']);
  assert.equal(byUrl['https://ielts.org/blocked'].linkStatus, 'unverified');
  assert.equal(byUrl['https://ielts.org/blocked'].license, A.LICENSE_EXAM_BOARD);
  assert.equal(byUrl['https://apprendre.tv5monde.com/fr'].license, A.LICENSE_PUBLIC);
  assert.equal(byUrl['https://learngerman.dw.com/en/learn-german/s-9528'].pageTitle, 'LEARN GERMAN');
});
await test('a header "Log in" link alone does not trigger the wall', () => {
  assert.equal(A.detectAccessWall(`<a href="/login">Log in</a>${'<p>Lots of free content here. </p>'.repeat(100)}`, 'https://ielts.org/x'), null);
});

console.log('discovery + exam format grounding');
await test('filterCandidates: allowlist, https, dedupe, exclude, skills', () => {
  const out = D.filterCandidates([
    { title: 'A', url: 'https://ielts.org/a#x', skills: ['reading', 'bogus'], levels: ['b2', 'Z1'] },
    { title: 'A dup', url: 'https://ielts.org/a/', skills: ['reading'] },
    { title: 'http', url: 'http://ielts.org/b', skills: ['reading'] },
    { title: 'off', url: 'https://ielts.org.evil.com/c', skills: ['reading'] },
    { title: 'excluded', url: 'https://www.goethe.de/x?utm_source=y', skills: ['reading'] },
    { title: 'noskill', url: 'https://www.goethe.de/z', skills: [] }
  ], ['https://www.goethe.de/x']);
  assert.deepEqual(out, [{ title: 'A', url: 'https://ielts.org/a', category: 'Study resource', skills: ['reading'], levels: ['B2'] }]);
});
await test('groundProfile drops ungrounded sections and numbers', () => {
  const text = 'Compréhension orale : 29 questions, 25 minutes. Maîtrise des structures de la langue.';
  const g = F.groundProfile({ sections: [
    { name: 'Compréhension orale', durationMinutes: 25, questionCount: 29, description: 'd' },
    { name: 'Expression orale', durationMinutes: 12, questionCount: null, description: 'invented' },
    { name: 'Structures de la langue', durationMinutes: 15, questionCount: 18, description: 'd' }], scoring: null, notes: '' }, text);
  assert.deepEqual(g.sections.map((s) => [s.name, s.durationMinutes, s.questionCount]), [['Compréhension orale', 25, 29], ['Structures de la langue', null, null]]);
  assert.equal(g.notes, null);
});

console.log('orchestrator end-to-end (stubbed)');
const plannerOut = (days) => ({ summary: 'Plan using [R1].', phases: [
  { phaseTitle: 'Listening', focus: 'Ears', startDay: 1, endDay: 9, tasks: ['Listen to [R1] daily', 'See https://x.com/y', 'Use [R7]'] },
  { phaseTitle: 'Reading', focus: 'Eyes', startDay: 9, endDay: 20, tasks: ['Read with [R2]'] },
  { phaseTitle: 'Mock', focus: 'Exam', startDay: 22, endDay: days, tasks: ['Mock exam via [R3]'] }] });
llm.discovery = () => ({ candidates: [
  { title: 'TV5', url: 'https://apprendre.tv5monde.com/fr', category: 'Listening', skills: ['listening'], levels: [] },
  { title: 'RFI', url: 'https://francaisfacile.rfi.fr/fr/', category: 'Listening', skills: ['listening'], levels: ['B2'] },
  { title: 'FEI', url: 'https://www.france-education-international.fr/test/tcf-tout-public', category: 'Official', skills: ['exam_format', 'mock_exam'], levels: [] },
  { title: 'Invented', url: 'https://www.tv5monde.com/does-not-exist', category: 'x', skills: ['reading'], levels: [] },
  { title: 'Off', url: 'https://some-blog.com/tcf', category: 'x', skills: ['reading'], levels: [] }] });
// v3: the planner only re-words the deterministic skeleton (polishPlan). Legacy prompts still get plannerOut.
const polishOut = (b) => {
  const { skeleton } = JSON.parse(b.messages.find((m) => m.role === 'user').content);
  return { summary: `Polished: ${skeleton.summary}`, phases: skeleton.phases.map((p) => ({ phaseTitle: `Polished ${p.phaseTitle}`, focus: p.focus, tasks: p.tasks })) };
};
llm.planner = (b) => (b.messages.some((m) => m.role === 'user' && m.content.includes('"skeleton"'))
  ? polishOut(b)
  : plannerOut(Number(/Total days: (\d+)/.exec(b.messages[1].content)[1])));
const counter = async (name) => {
  const snap = await globalThis.__fakeDb.pub().collection('counters').doc(name).collection('shards').get();
  return snap.docs.reduce((a, d) => a + (d.data().n || 0), 0);
};
const usageTotals = async (kind = 'u') => {
  const out = {};
  for (const d of (await globalThis.__fakeDb.pub().collection('usage_buckets').get()).docs) for (const [k, v] of Object.entries(d.data()[kind] || {})) out[k] = (out[k] || 0) + v;
  return out;
};
const { clearPlanCache } = await import('../lib/orchestrator.js');
llm.format = () => ({ sections: [{ name: 'TCF tout public', durationMinutes: 999, questionCount: null, description: 'd' }], scoring: null, notes: null });

await test('400 on bad input, never throws', async () => {
  const r = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 500 });
  assert.equal(r.status, 400); assert.match(r.body.error, /days/);
  const u = await generateRoadmap({ exam: 'NOTANEXAM', level: 'B2', days: 10 });
  assert.equal(u.status, 400);
});
let first;
await test('empty library -> discovery -> audit -> library -> planner -> cache', async () => {
  const r = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 30 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  first = r.body.roadmap;
  assert.equal(first.source, 'live_discovery');
  assert.equal(first.verifiedResources.length, 3);
  assert.ok(first.verifiedResources.every((v) => v.lastCheckedAt && v.license && ['ok', 'unverified'].includes(v.linkStatus)));
  assert.ok(!first.verifiedResources.some((v) => /does-not-exist|some-blog/.test(v.url)));
  assert.deepEqual(P.checkPlan(first, 30), []);
  assert.match(first.phases[0].phaseTitle, /^Days 1–\d+: Polished /);
  assert.equal(first.scheduleMethod, 'deterministic_v1');
  assert.equal(first.calendar.length, 30);
  assert.equal(first.planKey, 'TCF_B2_30');
  assert.deepEqual(first.progress, { done: {} });
  assert.equal(first.examProfile.sourceUrl, 'https://www.france-education-international.fr/test/tcf-tout-public');
  assert.equal(first.examProfile.sections[0].durationMinutes, null, 'ungrounded 999 must be nulled');
  assert.equal(first.examProfile.reviewed, false);
  const agents = first.pipeline.map((p) => `${p.agent}:${p.status}`);
  for (const a of ['global_cache:ok', 'resource_library:ok', 'discovery:ok', 'link_verifier:ok', 'copyright_auditor:ok', 'exam_format:ok', 'planner:ok']) assert.ok(agents.includes(a), a);
  const lib = await globalThis.__fakeDb.pub().collection('resources').where('exams', 'array-contains', 'TCF').get();
  assert.equal(lib.docs.length, 3);
  assert.ok(lib.docs.every((d) => d.data().approved === true && d.data().usageCount === 0), 'usage is counted in buckets, not on the resource doc');
  const used = await usageTotals('u');
  assert.ok(lib.docs.every((d) => used[d.id] === 1), JSON.stringify(used));
  assert.equal(await counter('roadmapsGenerated'), 1);
  const plan = (await globalThis.__fakeDb.pub().collection('plans').doc('TCF_B2_30').get()).data();
  assert.equal(plan.pipelineVersion, 3); assert.equal(plan.resourceIds.length, 3); assert.ok(plan.wording?.summary.startsWith('Polished'));
});
await test('second identical request is served from the global cache', async () => {
  fetchLog = [];
  const r = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 30 });
  assert.equal(r.status, 200); assert.equal(r.body.roadmap.source, 'global_cache');
  assert.equal(fetchLog.length, 0, 'no network on cache hit');
  assert.equal(await counter('cacheHits'), 1);
});
await test('plan cache: other day counts in the same bucket are rescheduled exactly (no LLM)', async () => {
  clearPlanCache(); fetchLog = [];
  const r = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 25 });
  assert.equal(r.status, 200); assert.equal(r.body.roadmap.source, 'global_cache');
  assert.equal(r.body.roadmap.calendar.length, 25); assert.equal(r.body.roadmap.days, 25);
  assert.deepEqual(P.checkPlan(r.body.roadmap, 25), []);
  assert.ok(r.body.roadmap.phases.some((p) => p.phaseTitle.includes('Polished')), 'wording comes from the cached polish');
  assert.equal(fetchLog.length, 0);
});
await test('client-written (unverified) cache entries are ignored', async () => {
  await globalThis.__fakeDb.pub().collection('global_verified_roadmaps').doc('TCF-B2-100').set({ roadmap: { exam: 'TCF', fake: true } });
  const r = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 100 });
  assert.equal(r.status, 200); assert.equal(r.body.roadmap.source, 'library'); assert.ok(!r.body.roadmap.fake);
});
await test('diagnostic -> personalised, library-first, cached per profile band', async () => {
  fetchLog = [];
  const r = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 30, diagnostic: { skillScores: { listening: 0.2, reading: 0.8 } } });
  assert.equal(r.status, 200); assert.equal(r.body.roadmap.source, 'library');
  assert.match(r.body.roadmap.id, /^TCF-B2-30-p-/);
  assert.equal(r.body.roadmap.planKey, 'TCF_B2_30_ws----');
  assert.ok(!fetchLog.some((l) => l.includes('discovery')));
  // Same band (0.25 / 0.9 quantise to w / s) -> shared personalised plan, no LLM.
  fetchLog = [];
  const r2 = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 30, diagnostic: { skillScores: { listening: 0.25, reading: 0.9 } } });
  assert.equal(r2.body.roadmap.source, 'global_cache'); assert.equal(fetchLog.length, 0);
  assert.match(r2.body.roadmap.id, /^TCF-B2-30-p-/);
});
await test('LLM planner down -> deterministic fallback, not cached', async () => {
  const saved = llm.planner; llm.planner = () => ({ httpStatus: 400 });
  const r = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 12, forceRefresh: true });
  llm.planner = saved;
  assert.equal(r.status, 200);
  assert.ok(r.body.roadmap.pipeline.some((p) => p.agent === 'planner' && p.status === 'failed'));
  assert.deepEqual(P.checkPlan(r.body.roadmap, 12), []);
  assert.equal(r.body.roadmap.scheduleMethod, 'deterministic_v1');
  assert.equal(await counter('fallbackPlans'), 1);
  assert.equal((await globalThis.__fakeDb.pub().collection('global_verified_roadmaps').doc('TCF-B2-12').get()).exists, false);
  // The deterministic plan is cached without wording; with an LLM configured it is re-polished next time.
  const cached = (await globalThis.__fakeDb.pub().collection('plans').doc('TCF_B2_14').get()).data();
  assert.equal(cached.wording, null);
  clearPlanCache();
  const again = await generateRoadmap({ exam: 'TCF', level: 'B2', days: 12 });
  assert.notEqual(again.body.roadmap.source, 'global_cache');
  assert.ok((await globalThis.__fakeDb.pub().collection('plans').doc('TCF_B2_14').get()).data().wording);
});
await test('not enough verified resources -> 422 with trace (discovery retried once)', async () => {
  llm.discovery = () => ({ candidates: [{ title: 'Off', url: 'https://some-blog.com/x', category: 'x', skills: ['reading'], levels: [] }] });
  const r = await generateRoadmap({ exam: 'IELTS', level: 'B2', days: 30 });
  assert.equal(r.status, 422); assert.match(r.body.error, /Not enough verified/);
  assert.equal(r.body.pipeline.filter((p) => p.agent === 'discovery').length, 2);
});
await test('saveToLibrary handles empty levels (lib arrayUnion() workaround)', async () => {
  const id = await saveToLibrary({ url: 'https://www.goethe.de/de/spr/prf.html', title: 'G', category: 'c', skills: ['exam_format'], levels: [], license: 'L', linkStatus: 'ok', httpCode: 200 }, { exam: 'GOETHE', addedBy: 'seed' });
  const d = (await globalThis.__fakeDb.pub().collection('resources').doc(id).get()).data();
  assert.equal(d.addedBy, 'seed'); assert.ok(Array.isArray(d.levels));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
