#!/usr/bin/env node
/**
 * End-to-end test of the OpenExam Hub server over real HTTP against REAL infrastructure:
 *   - Firestore emulator (rules + indexes from ./firestore.rules / ./firestore.indexes.json)
 *   - live HTTP link checks to the official sites (seed + discovery + check-link + cron)
 *   - a mock OpenAI-compatible gateway (scripts/mock-llm.mjs) standing in for OmniRoute
 *   - api/** served by scripts/local-server.mjs (Vercel Node helper semantics)
 *
 *   npm run e2e            (starts and stops everything itself)
 *
 * Safety: refuses to run unless the project id starts with "demo-" (the Firebase emulator's
 * offline-only namespace) and all Firestore traffic goes to FIRESTORE_EMULATOR_HOST. Service-account
 * variables are removed from every child process, so no test data can reach a real project.
 *
 * Env overrides: E2E_PROJECT (demo-openexam), E2E_EMULATOR_PORT (8085), E2E_API_PORT (3001), E2E_LLM_PORT (4010),
 *                FIRESTORE_EMULATOR_HOST (reuse an emulator that is already running).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = SERVER; // repo root: firebase.json, firestore.rules, api/, lib/ all live here
const PROJECT = process.env.E2E_PROJECT || 'demo-openexam';
if (!PROJECT.startsWith('demo-')) {
  console.error(`Refusing to run: E2E_PROJECT must start with "demo-" (got ${PROJECT}). Tests never touch a real project.`);
  process.exit(1);
}
const EMU_PORT = Number(process.env.E2E_EMULATOR_PORT || 8085);
const EMU = process.env.FIRESTORE_EMULATOR_HOST || `127.0.0.1:${EMU_PORT}`;
const API_PORT = Number(process.env.E2E_API_PORT || 3001);
const LLM_PORT = Number(process.env.E2E_LLM_PORT || 4010);
const API = `http://127.0.0.1:${API_PORT}`;
const LLM = `http://127.0.0.1:${LLM_PORT}`;
const APP_ID = 'openexam-hub-e2e';

const ENV = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: EMU,
  FIREBASE_PROJECT_ID: PROJECT,
  GCLOUD_PROJECT: PROJECT,
  APP_ID,
  LLM_BASE_URL: `${LLM}/v1`,
  LLM_API_KEY: 'test-key',
  LLM_MODEL: 'auto',
  CRON_SECRET: 'cron-secret-e2e',
  ADMIN_SECRET: 'admin-secret-e2e',
  GITHUB_SPONSORS_WEBHOOK_SECRET: 'gh-secret-e2e',
  KOFI_VERIFICATION_TOKEN: 'kofi-token-e2e',
  OPEN_COLLECTIVE_WEBHOOK_TOKEN: 'oc-token-e2e',
  E2E_GENERATE_TOKEN: 'e2e-generate-token',
  OPEN_COLLECTIVE_SLUG: 'openexam-hub',
  FX_USD_EUR: '0.92',
  LOCAL_SERVER_QUIET: '1'
};
for (const k of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'LLM_FALLBACK_BASE_URL', 'LLM_FALLBACK_API_KEY', 'LLM_FALLBACK_MODEL', 'EXTRA_ALLOWED_DOMAINS']) delete ENV[k];
Object.assign(process.env, ENV);
for (const k of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS']) delete process.env[k];

// ------------------------------------------------------------------ process management
const children = [];
function start(name, cmd, args, { cwd = SERVER, quiet = true } = {}) {
  const p = spawn(cmd, args, { cwd, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  const keep = (d) => { p.log += d; if (p.log.length > 200000) p.log = p.log.slice(-100000); if (!quiet) process.stdout.write(d); };
  p.stdout.on('data', keep);
  p.stderr.on('data', keep);
  p.name = name;
  children.push(p);
  return p;
}
function stopAll() {
  for (const p of children) if (p.exitCode === null) p.kill('SIGTERM');
}
process.on('exit', stopAll);
process.on('SIGINT', () => { stopAll(); process.exit(130); });

async function waitFor(url, ms, name) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.status < 500) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${name} did not start at ${url}`);
}
function runNode(script, args = []) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script, ...args], { cwd: SERVER, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => resolve({ code, out }));
  });
}

// ------------------------------------------------------------------ test harness
const results = [];
let current = '';
async function test(name, fn) {
  current = name;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✔ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  ✘ ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 4).join('\n      ')}`);
  }
}
const section = (s) => console.log(`\n${s}`);

async function http(method, p, { body, headers = {}, raw } = {}) {
  const h = { ...headers };
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] ||= 'application/json'; }
  const res = await fetch(`${API}${p}`, { method, headers: h, body: payload, signal: AbortSignal.timeout(120000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}
const LEARNER_API = ['/api/generate-roadmap', '/api/diagnostic', '/api/practice', '/api/coach'];
const post = (p, body, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  if (LEARNER_API.includes(p) && !hasAuth && !opts.noAuth) {
    headers.authorization = `Bearer ${ENV.E2E_GENERATE_TOKEN}`;
  }
  return http('POST', p, { ...opts, body, headers });
};
const get = (p, opts = {}) => http('GET', p, opts);
const admin = { authorization: 'Bearer admin-secret-e2e' };
const learner = { authorization: `Bearer ${ENV.E2E_GENERATE_TOKEN}` };

const llmCalls = async () => (await (await fetch(`${LLM}/__calls`)).json());
const llmControl = (c) => fetch(`${LLM}/__control`, { method: 'POST', body: JSON.stringify(c) });
async function callsDuring(fn) {
  const before = (await llmCalls()).length;
  const out = await fn();
  const calls = (await llmCalls()).slice(before);
  return { out, calls, agents: calls.map((c) => c.agent) };
}

// ------------------------------------------------------------------ Firestore (emulator) access
let db;
let pub;
async function initAdmin() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({ projectId: PROJECT }, 'e2e-asserts');
  db = getFirestore(app);
  pub = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}
const docData = async (col, id) => (await pub().collection(col).doc(id).get()).data();
const counter = async (name) => (await pub().collection('counters').doc(name).collection('shards').get()).docs.reduce((a, d) => a + (d.data().n || 0), 0);
async function usageTotals(kind = 'u') {
  const out = {};
  for (const d of (await pub().collection('usage_buckets').get()).docs) for (const [k, v] of Object.entries(d.data()[kind] || {})) out[k] = (out[k] || 0) + v;
  return out;
}

async function clearEmulator() {
  const r = await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`could not clear emulator: HTTP ${r.status}`);
}

// ------------------------------------------------------------------ contract shape checks
const ALLOWED = ['france-education-international.fr', 'tv5monde.com', 'rfi.fr', 'britishcouncil.org', 'ielts.org', 'cambridgeenglish.org', 'goethe.de', 'dw.com', 'vhs-lernportal.de', 'europa.eu'];
const onAllowlist = (u) => { const h = new URL(u).hostname; return new URL(u).protocol === 'https:' && ALLOWED.some((d) => h === d || h.endsWith(`.${d}`)); };
const URLISH = /https?:\/\/|www\./i;
const isoOrNull = (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));

function assertRoadmap(r, { exam, level, days }) {
  assert.ok(r && typeof r === 'object', 'roadmap object');
  for (const k of ['id', 'exam', 'level', 'days', 'createdAt', 'summary', 'completedTasks', 'verifiedResources', 'phases', 'pipeline', 'source']) assert.ok(k in r, `roadmap.${k} missing`);
  assert.equal(r.exam, exam);
  assert.equal(r.level, level);
  assert.equal(r.days, days);
  assert.match(r.createdAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof r.summary, 'string');
  assert.deepEqual(r.completedTasks, {});
  assert.ok(['global_cache', 'library', 'live_discovery'].includes(r.source), `source ${r.source}`);
  assert.ok(Array.isArray(r.verifiedResources) && r.verifiedResources.length >= 3, 'at least 3 verified resources');
  for (const v of r.verifiedResources) {
    for (const k of ['id', 'title', 'url', 'license', 'category', 'linkStatus', 'lastCheckedAt']) assert.ok(k in v, `verifiedResources.${k} missing`);
    assert.ok(onAllowlist(v.url), `off-allowlist resource ${v.url}`);
    assert.ok(['ok', 'unverified'].includes(v.linkStatus), `bad linkStatus ${v.linkStatus}`);
    assert.ok(isoOrNull(v.lastCheckedAt), `lastCheckedAt ${v.lastCheckedAt}`);
  }
  assert.ok(Array.isArray(r.phases) && r.phases.length >= 1 && r.phases.length <= 6);
  for (const p of r.phases) {
    assert.equal(typeof p.phaseTitle, 'string');
    assert.equal(typeof p.focus, 'string');
    assert.ok(Array.isArray(p.tasks) && p.tasks.length, 'phase tasks');
    for (const t of p.tasks) assert.ok(typeof t === 'string' && !URLISH.test(t), `task has URL: ${t}`);
  }
  if (r.phases[0].startDay !== undefined) {
    assert.equal(r.phases[0].startDay, 1);
    assert.equal(r.phases.at(-1).endDay, days);
    for (let i = 1; i < r.phases.length; i++) assert.equal(r.phases[i].startDay, r.phases[i - 1].endDay + 1, 'contiguous phases');
  }
  for (const s of r.pipeline) {
    assert.equal(typeof s.agent, 'string');
    assert.ok(['ok', 'skipped', 'failed'].includes(s.status), `pipeline status ${s.status}`);
    assert.equal(typeof s.detail, 'string');
    // The build log is shown to learners: exam names, never plan keys or raw exam ids.
    if (s.status === 'ok') assert.doesNotMatch(s.detail, /plan key|\b[A-Z]{2,}_[A-Z0-9_]{2,}\b|\b[A-Z]{3,}-[A-C][12]-\d+\b/, `raw id in build log: ${s.detail}`);
  }
  if (process.env.E2E_SHOW_PIPELINE) console.log(r.pipeline.map((s) => `      ${s.agent}: ${s.detail}`).join('\n'));
  // v3 deterministic schedule (lib/algo/schedule.js): one compact code per day + empty progress map.
  if (r.calendar !== undefined) {
    assert.equal(r.calendar.length, days, 'calendar covers every day');
    assert.equal(r.scheduleMethod, 'deterministic_v1');
    assert.match(r.planKey, new RegExp(`^${exam}_${level}_\\d+(_[wms-]{6})?$`));
    assert.deepEqual(r.progress, { done: {} });
  }
  if (r.examProfile) {
    assert.ok(Array.isArray(r.examProfile.sections));
    assert.ok(onAllowlist(r.examProfile.sourceUrl));
    assert.equal(typeof r.examProfile.reviewed, 'boolean');
  }
}
const step = (r, agent) => r.pipeline.filter((s) => s.agent === agent);

// ------------------------------------------------------------------ the suite
async function main() {
  console.log('OpenExam Hub e2e');
  // 1. infrastructure
  let emulatorUp = false;
  try { emulatorUp = (await fetch(`http://${EMU}/`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* start it */ }
  if (!emulatorUp) {
    console.log(`starting Firestore emulator on ${EMU} (project ${PROJECT})…`);
    start('emulator', path.join(SERVER, 'node_modules/.bin/firebase'), ['emulators:start', '--only', 'firestore', '--project', PROJECT, '--config', path.join(ROOT, 'firebase.json')], { cwd: ROOT });
    await waitFor(`http://${EMU}/`, 90000, 'Firestore emulator');
  } else console.log(`reusing Firestore emulator at ${EMU}`);
  start('mock-llm', process.execPath, ['scripts/mock-llm.mjs', String(LLM_PORT)]);
  start('api', process.execPath, ['scripts/local-server.mjs', String(API_PORT)]);
  await waitFor(`${LLM}/v1/models`, 10000, 'mock LLM');
  await waitFor(`${API}/api/library?exam=TCF`, 15000, 'local API');
  await clearEmulator();
  await initAdmin();

  section('Seed library (live link checks)');
  await test('seed-library.js audits and writes all 9 curated resources', async () => {
    const { code, out } = await runNode('scripts/seed-library.js');
    assert.equal(code, 0, out);
    assert.match(out, /Done: 9 written, 0 rejected/);
    const snap = await pub().collection('resources').get();
    assert.equal(snap.size, 9);
    for (const d of snap.docs) {
      const r = d.data();
      assert.equal(r.approved, true);
      assert.equal(r.addedBy, 'seed');
      assert.ok(['ok', 'unverified'].includes(r.linkStatus), `${r.url} ${r.linkStatus}`);
      assert.ok(r.lastCheckedAt?.toDate, 'lastCheckedAt is a Firestore Timestamp');
      assert.ok(onAllowlist(r.url));
    }
  });

  section('Bad input');
  await test('400s for invalid requests (and 405/401/404 where relevant)', async () => {
    const cases = [
      ['POST', '/api/generate-roadmap', { exam: 'TCF', level: 'B2', days: 30 }, 401],
      ['POST', '/api/generate-roadmap', { exam: 'TCF', level: 'Z9', days: 30 }, 400, learner],
      ['POST', '/api/generate-roadmap', { exam: 'TCF', level: 'B2', days: 0 }, 400, learner],
      ['POST', '/api/generate-roadmap', { level: 'B2', days: 30 }, 400, learner],
      ['POST', '/api/generate-roadmap', { exam: 'TCF', level: 'B2', days: 30, forceRefresh: 'yes' }, 400, learner],
      ['POST', '/api/generate-roadmap', { exam: 'TCF', level: 'B2', days: 30, diagnostic: { skillScores: { cooking: 0.5 } } }, 400, learner],
      ['POST', '/api/generate-roadmap', { exam: 'ZZTOP', level: 'B2', days: 30 }, 400, learner],
      ['POST', '/api/diagnostic', { action: 'create', exam: 'TCF', level: 'B2' }, 401],
      ['POST', '/api/practice', { exam: 'TCF', level: 'B2', skill: 'reading', count: 5 }, 401],
      ['POST', '/api/coach', { roadmap: { days: 10, phases: [{ tasks: ['a'] }] }, daysElapsed: 3 }, 401],
      ['POST', '/api/diagnostic', { action: 'explode', exam: 'TCF', level: 'B2' }, 400, learner],
      ['POST', '/api/diagnostic', { action: 'create', exam: 'XYZ', level: 'B2' }, 400, learner],
      ['POST', '/api/diagnostic', { action: 'score', exam: 'TCF', level: 'B2', answers: [] }, 400, learner],
      ['POST', '/api/practice', { exam: 'TCF', level: 'B2', skill: 'juggling' }, 400, learner],
      ['POST', '/api/practice', { exam: 'TCF', level: 'B2', skill: 'reading', count: 11 }, 400, learner],
      ['POST', '/api/coach', { daysElapsed: 3 }, 400, learner],
      ['POST', '/api/coach', { roadmap: { days: 10, phases: [{ tasks: ['a'] }] }, daysElapsed: 99 }, 400, learner],
      ['GET', '/api/library', undefined, 400],
      ['GET', '/api/library?exam=TCF&level=Z1', undefined, 400],
      ['GET', '/api/library?exam=TCF&skill=juggling', undefined, 400],
      ['GET', '/api/check-link', undefined, 400],
      ['GET', '/api/check-link?url=ftp%3A%2F%2Fgoethe.de%2Fx', undefined, 400],
      ['GET', '/api/generate-roadmap', undefined, 405],
      ['GET', '/api/plan?exam=TCF&level=B2', undefined, 400],
      ['GET', '/api/plan?exam=TCF&level=B2&days=30&profile=zzzzzz', undefined, 400],
      ['POST', '/api/plan', {}, 405],
      ['POST', '/api/stats', {}, 405],
      ['POST', '/api/events', { type: 'hack', planKey: 'TCF_B2_30', resourceId: '0123456789abcdef01234567' }, 400],
      ['POST', '/api/events', { type: 'task_done', planKey: '../x', resourceId: '0123456789abcdef01234567' }, 400],
      ['GET', '/api/events', undefined, 405],
      ['POST', '/api/admin/expand', { exam: 'TEF', levels: ['Q7'] }, 400, admin],
      ['POST', '/api/admin/expand', { exam: 'TEF', levels: ['B1'] }, 401],
      ['POST', '/api/admin/approve', { resourceIds: ['not-an-id'], approve: true }, 400, admin],
      ['POST', '/api/admin/approve', { resourceIds: ['0123456789abcdef01234567'], approve: 'yes' }, 400, admin],
      ['POST', '/api/admin/review-profile', { exam: 'x', reviewed: true }, 400, admin],
      ['GET', '/api/cron/recheck-links', undefined, 401],
      // unknown names on the dispatcher functions (api/[route].js, admin/[action].js, ...) -> JSON 404
      ['GET', '/api/no-such-route', undefined, 404],
      ['POST', '/api/admin/no-such-action', {}, 404, admin],
      ['POST', '/api/webhooks/no-such-provider', {}, 404],
      ['GET', '/api/cron/no-such-job', undefined, 404]
    ];
    for (const [m, p, body, want, headers] of cases) {
      const r = await http(m, p, { body, headers });
      assert.equal(r.status, want, `${m} ${p} ${JSON.stringify(body)} -> ${r.status} ${r.text.slice(0, 200)}`);
      assert.ok(r.json && typeof r.json.error === 'string', `${p} error body: ${r.text.slice(0, 120)}`);
    }
  });
  await test('malformed JSON bodies are 400, not 500, on every JSON route', async () => {
    for (const p of ['/api/generate-roadmap', '/api/diagnostic', '/api/coach', '/api/practice', '/api/admin/expand', '/api/admin/approve', '/api/admin/review-profile']) {
      const auth = LEARNER_API.includes(p) ? learner : admin;
      const r = await http('POST', p, { raw: '{"exam": "TCF",', headers: { 'content-type': 'application/json', ...auth } });
      assert.equal(r.status, 400, `${p} -> ${r.status} ${r.text.slice(0, 120)}`);
    }
  });
  await test('CORS preflight answers 204', async () => {
    const r = await http('OPTIONS', '/api/generate-roadmap', { headers: { origin: 'https://example.org', 'access-control-request-method': 'POST' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
  });

  section('Roadmaps: library first, then the shared cache');
  const roadmaps = {};
  for (const [exam, level, days] of [['TCF', 'B2', 30], ['IELTS', 'B2', 30], ['GOETHE', 'B1', 30]]) {
    const key = `${exam}-${level}-${days}`;
    await test(`${key}: first request is built from the library without searching outside`, async () => {
      const { out: r, agents } = await callsDuring(() => post('/api/generate-roadmap', { exam, level, days }));
      assert.equal(r.status, 200, r.text);
      const rm = r.json.roadmap;
      assertRoadmap(rm, { exam, level, days });
      assert.equal(rm.source, 'library');
      assert.equal(rm.id, key);
      assert.equal(step(rm, 'discovery')[0].status, 'skipped');
      assert.ok(!agents.includes('DISCOVERY'), `no discovery call, got ${agents}`);
      assert.ok(agents.includes('PLANNER'));
      assert.equal(step(rm, 'planner')[0].status, 'ok');
      assert.ok(rm.verifiedResources.every((v) => v.id.length === 24));
      assert.ok(rm.calendar, 'v3 schedule present');
      assert.equal(rm.planKey, `${exam}_${level}_30`);
      // v3 shared cache: plans/{planKey} holds ranked resource snapshots + wording, never a learner's roadmap
      const cache = await docData('plans', rm.planKey);
      assert.equal(cache?.pipelineVersion, 3);
      assert.deepEqual(cache.resourceIds, rm.verifiedResources.map((v) => v.id));
      assert.ok(cache.wording?.summary, 'polished wording cached');
      assert.ok(!('completedTasks' in cache) && !('progress' in cache), 'cache doc has no learner state');
      assert.equal(await docData('global_verified_roadmaps', key), undefined, 'legacy cache no longer written');
      const used = await usageTotals('u');
      for (const v of rm.verifiedResources) assert.ok(used[v.id] >= 1, 'usage recorded in a sharded bucket');
      roadmaps[key] = rm;
    });
    await test(`${key}: repeat request is served from global_cache with zero LLM calls`, async () => {
      const { out: r, calls } = await callsDuring(() => post('/api/generate-roadmap', { exam: exam.toLowerCase(), level: level.toLowerCase(), days: String(days) }));
      assert.equal(r.status, 200, r.text);
      assertRoadmap(r.json.roadmap, { exam, level, days });
      assert.equal(r.json.roadmap.source, 'global_cache');
      assert.equal(calls.length, 0);
      assert.deepEqual(r.json.roadmap.phases, roadmaps[key].phases);
      assert.deepEqual(r.json.roadmap.calendar, roadmaps[key].calendar);
    });
  }
  await test('GET /api/plan: CDN-cacheable shared plan, rescheduled for exactly the requested days; 404 on a miss', async () => {
    const { out: r, calls } = await callsDuring(() => get('/api/plan?exam=TCF&level=B2&days=30'));
    assert.equal(r.status, 200, r.text);
    assert.equal(calls.length, 0);
    assert.match(r.headers.get('cache-control'), /s-maxage=3600/);
    assertRoadmap(r.json.roadmap, { exam: 'TCF', level: 'B2', days: 30 });
    assert.deepEqual(r.json.roadmap.calendar, roadmaps['TCF-B2-30'].calendar);
    const r25 = await get('/api/plan?exam=tcf&level=b2&days=25');
    assert.equal(r25.status, 200, r25.text);
    assertRoadmap(r25.json.roadmap, { exam: 'TCF', level: 'B2', days: 25 });
    assert.equal(r25.json.roadmap.planKey, 'TCF_B2_30');
    const miss = await get('/api/plan?exam=TCF&level=C2&days=30');
    assert.equal(miss.status, 404);
    assert.equal(miss.headers.get('cache-control'), 'no-store');
    assert.equal(miss.json.planKey, 'TCF_C2_30');
  });
  await test('POST /api/events: completion signal for a cited resource -> 202 + usage bucket; uncited -> 400', async () => {
    const rid = roadmaps['TCF-B2-30'].verifiedResources[0].id;
    const ok = await post('/api/events', { type: 'task_done', planKey: 'TCF_B2_30', resourceId: rid });
    assert.equal(ok.status, 202, ok.text);
    assert.ok((await usageTotals('c'))[rid] >= 1);
    const bad = await post('/api/events', { type: 'task_done', planKey: 'TCF_B2_30', resourceId: 'abcdefabcdefabcdefabcdef' });
    assert.ok([400, 404].includes(bad.status), bad.text);
  });
  await test('TCF exam format profile was extracted from the official page text and saved unreviewed', async () => {
    const prof = await docData('exam_profiles', 'TCF');
    assert.ok(prof, 'exam_profiles/TCF exists');
    assert.equal(prof.reviewed, false);
    assert.ok(onAllowlist(prof.sourceUrl));
    assert.ok(prof.sections.length >= 1);
    assert.ok(roadmaps['TCF-B2-30'].examProfile?.sections?.length >= 1);
  });
  await test('forceRefresh skips the cache, re-plans from the library and rewrites the cache', async () => {
    const before = await docData('plans', 'TCF_B2_30');
    const { out: r, agents } = await callsDuring(() => post('/api/generate-roadmap', { exam: 'TCF', level: 'B2', days: 30, forceRefresh: true }));
    assert.equal(r.status, 200, r.text);
    assertRoadmap(r.json.roadmap, { exam: 'TCF', level: 'B2', days: 30 });
    assert.equal(r.json.roadmap.source, 'library');
    assert.match(step(r.json.roadmap, 'global_cache')[0].detail, /forceRefresh/);
    assert.ok(agents.includes('PLANNER') && !agents.includes('DISCOVERY'));
    const after = await docData('plans', 'TCF_B2_30');
    assert.ok(after.cachedAt.toMillis() >= before.cachedAt.toMillis());
  });
  await test('planner outage -> deterministic plan, cached without wording, re-polished when the LLM is back', async () => {
    await llmControl({ fail: ['PLANNER'] });
    try {
      const r = await post('/api/generate-roadmap', { exam: 'IELTS', level: 'C1', days: 10 });
      assert.equal(r.status, 200, r.text);
      assertRoadmap(r.json.roadmap, { exam: 'IELTS', level: 'C1', days: 10 });
      assert.equal(step(r.json.roadmap, 'planner')[0].status, 'failed');
      assert.match(step(r.json.roadmap, 'global_cache').at(-1).detail, /standard wording/);
      assert.equal((await docData('plans', 'IELTS_C1_14')).wording, null);
      assert.ok((await counter('fallbackPlans')) >= 1);
    } finally {
      await llmControl({ fail: [] });
    }
    const { out: again, agents } = await callsDuring(() => post('/api/generate-roadmap', { exam: 'IELTS', level: 'C1', days: 10 }));
    assert.equal(again.status, 200, again.text);
    assert.ok(agents.includes('PLANNER'), 'unpolished cache entry is re-polished');
    assert.ok((await docData('plans', 'IELTS_C1_14')).wording?.summary);
  });

  section('Discovery: material found outside is stored, then reused');
  let rfiId;
  await test('an admin-rejected library resource is never resurfaced by discovery', async () => {
    rfiId = roadmaps['TCF-B2-30'].verifiedResources.find((v) => /francaisfacile\.rfi\.fr/.test(v.url))?.id;
    assert.ok(rfiId, 'RFI resource id');
    const r = await post('/api/admin/approve', { resourceIds: [rfiId], approve: false }, { headers: admin });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.updated, 1);
    assert.equal((await docData('resources', rfiId)).approved, false);
  });
  await test('DELF-B1-14: empty library -> live discovery, real link checks, saved to the library', async () => {
    const { out: r, agents } = await callsDuring(() => post('/api/generate-roadmap', { exam: 'DELF', level: 'B1', days: 14 }));
    assert.equal(r.status, 200, r.text);
    const rm = r.json.roadmap;
    assertRoadmap(rm, { exam: 'DELF', level: 'B1', days: 14 });
    assert.equal(rm.source, 'live_discovery');
    assert.ok(agents.includes('DISCOVERY'));
    const urls = rm.verifiedResources.map((v) => v.url);
    assert.ok(!urls.some((u) => /example-blog|does-not-exist/.test(u)), `bad candidates leaked: ${urls}`);
    assert.ok(!rm.verifiedResources.some((v) => v.id === rfiId), 'rejected RFI resource must not be used');
    assert.ok(rm.pipeline.some((s) => /not approved; not used/.test(s.detail)), 'trace notes the skipped unapproved resource');
    assert.match(step(rm, 'copyright_auditor').find((s) => s.status === 'ok').detail, /rejected/);
    for (const v of rm.verifiedResources) {
      const d = await docData('resources', v.id);
      assert.ok(d.exams.includes('DELF'), `${v.url} tagged DELF`);
      assert.equal(d.approved, true);
    }
    const all = (await pub().collection('resources').get()).docs.map((d) => d.data().url);
    assert.ok(!all.some((u) => /does-not-exist|example-blog/.test(u)), 'dead/off-allowlist candidates never stored');
    assert.equal((await docData('resources', rfiId)).approved, false, 'rejection kept');
  });
  await test('DELF-B1-21: next learner gets library material with NO outside search', async () => {
    const { out: r, agents } = await callsDuring(() => post('/api/generate-roadmap', { exam: 'DELF', level: 'B1', days: 21 }));
    assert.equal(r.status, 200, r.text);
    assertRoadmap(r.json.roadmap, { exam: 'DELF', level: 'B1', days: 21 });
    assert.equal(r.json.roadmap.source, 'library');
    assert.ok(!agents.includes('DISCOVERY'), `agents: ${agents}`);
  });
  await test('re-approve the RFI resource', async () => {
    const r = await post('/api/admin/approve', { resourceIds: [rfiId], approve: true }, { headers: admin });
    assert.equal(r.status, 200);
    assert.equal((await docData('resources', rfiId)).approved, true);
  });

  section('Diagnostic (placement self-check)');
  let skillScores;
  await test('create TCF B2: 12 original questions, 2 per skill, cached as a variant', async () => {
    const r = await post('/api/diagnostic', { action: 'create', exam: 'TCF', level: 'B2' });
    assert.equal(r.status, 200, r.text);
    const d = r.json;
    assert.equal(typeof d.quizId, 'string');
    assert.equal(d.questions.length, 12);
    const per = {};
    for (const q of d.questions) {
      for (const k of ['id', 'skill', 'prompt', 'options', 'answerIndex', 'explanation']) assert.ok(k in q, `question.${k}`);
      assert.equal(q.options.length, 4);
      assert.ok(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex <= 3);
      if (q.skill === 'listening') assert.ok(q.transcript?.length > 20);
      per[q.skill] = (per[q.skill] || 0) + 1;
    }
    assert.deepEqual(Object.values(per), [2, 2, 2, 2, 2, 2]);
    assert.match(d.notice, /not an official placement test/i);
    const doc = await docData('practice_sets', 'diagnostic-TCF-B2');
    assert.equal(doc.variants.length, 1);
    // score: listening and grammar wrong, everything else right
    for (const q of d.questions) assert.ok(/^[A-C][12]_[0-9a-f]{8}$/.test(q.itemKey) && typeof q.b === 'number', 'IRT item key + difficulty');
    const answers = d.questions.map((q) => ({ id: q.id, skill: q.skill, cefr: q.cefr, itemKey: q.itemKey, b: q.b, correct: !['listening', 'grammar'].includes(q.skill) }));
    const s = await post('/api/diagnostic', { action: 'score', exam: 'TCF', level: 'B2', answers });
    assert.equal(s.status, 200, s.text);
    assert.equal(s.json.method, 'irt_eap');
    assert.equal(s.json.rawSkillScores.listening, 0);
    assert.equal(s.json.rawSkillScores.reading, 1);
    assert.ok(s.json.skillScores.listening < 0.5 && s.json.skillScores.reading > 0.5);
    assert.ok(s.json.confidence > 0 && s.json.confidence <= 1);
    const calib = (await pub().collection('calib_buckets').get()).docs.filter((x) => x.id.endsWith('_TCF_B2'));
    assert.ok(calib.length >= 1, 'calibration bucket written');
    assert.ok(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'pre-A1'].includes(s.json.estimatedLevel));
    assert.ok(Array.isArray(s.json.advice) && s.json.advice.some((a) => /listening/.test(a)));
    assert.ok(s.json.weakSkills.includes('grammar') && s.json.weakSkills.includes('listening') && !s.json.weakSkills.includes('reading'));
    skillScores = s.json.skillScores;
  });
  await test('score without per-question CEFR tags falls back to the overall ratio', async () => {
    const s = await post('/api/diagnostic', { action: 'score', exam: 'GOETHE', level: 'B1', answers: [{ skill: 'reading', correct: true }, { skill: 'reading', correct: true }, { skill: 'listening', correct: false }] });
    assert.equal(s.status, 200, s.text);
    assert.equal(s.json.method, 'overall_ratio');
  });
  await test('generate-roadmap with the diagnostic: personalised, cached per profile band (no raw scores stored)', async () => {
    const before = await docData('plans', 'TCF_B2_30');
    const r = await post('/api/generate-roadmap', { exam: 'TCF', level: 'B2', days: 30, diagnostic: { skillScores } });
    assert.equal(r.status, 200, r.text);
    const rm = r.json.roadmap;
    assertRoadmap(rm, { exam: 'TCF', level: 'B2', days: 30 });
    assert.match(rm.id, /^TCF-B2-30-p-[0-9a-f]{8}$/);
    assert.equal(rm.source, 'library');
    assert.match(rm.planKey, /^TCF_B2_30_[wms-]{6}$/);
    const after = await docData('plans', 'TCF_B2_30');
    assert.equal(after?.cachedAt?.toMillis(), before?.cachedAt?.toMillis(), 'non-personalised plan untouched');
    const pers = await docData('plans', rm.planKey);
    assert.ok(pers && !JSON.stringify(pers).includes(String(skillScores.reading)), 'only the band is stored');
    const profile = rm.planKey.split('_').pop();
    const { out: g, calls } = await callsDuring(() => get(`/api/plan?exam=TCF&level=B2&days=30&profile=${profile}`));
    assert.equal(g.status, 200, g.text); assert.equal(calls.length, 0);
    assert.equal(g.json.roadmap.planKey, rm.planKey);
  });
  await test('diagnostic variants rotate (3 live, then served from cache)', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await post('/api/diagnostic', { action: 'create', exam: 'TCF', level: 'B2' })).status, 200);
    const doc = await docData('practice_sets', 'diagnostic-TCF-B2');
    assert.equal(doc.variants.length, 3);
    const { out: r, calls } = await callsDuring(() => post('/api/diagnostic', { action: 'create', exam: 'TCF', level: 'B2' }));
    assert.equal(r.json.source, 'cache');
    assert.equal(calls.length, 0);
  });

  section('Progress coach');
  // Phase-checklist (pre-v3) roadmaps keep the old coach semantics: completedTasks + daysElapsed.
  const { calendar: _c, progress: _p, allocation: _a, scheduleMethod: _s, planKey: _k, ...rm } = roadmaps['TCF-B2-30'];
  const totalTasks = rm.phases.reduce((n, p) => n + p.tasks.length, 0);
  await test('on track -> deterministic answer, no LLM call', async () => {
    const completedTasks = { '0-0': true, '0-1': true };
    const { out: r, calls } = await callsDuring(() => post('/api/coach', { roadmap: { ...rm, completedTasks }, daysElapsed: 3 }));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.onTrack, true);
    assert.equal(r.json.source, 'deterministic');
    assert.deepEqual(r.json.rebalancedPhases, []);
    assert.ok(Array.isArray(r.json.tips) && typeof r.json.summary === 'string');
    assert.equal(calls.length, 0);
  });
  await test('behind -> LLM rebalance of only the remaining tasks into the remaining days', async () => {
    const r = await post('/api/coach', { roadmap: { ...rm, completedTasks: { '0-0': true } }, daysElapsed: 20 });
    assert.equal(r.status, 200, r.text);
    const c = r.json;
    assert.equal(c.onTrack, false);
    assert.equal(c.source, 'llm');
    assert.equal(c.remainingDays, 10);
    assert.equal(c.rebalancedPhases.reduce((n, p) => n + p.days, 0), 10);
    const scheduled = c.rebalancedPhases.flatMap((p) => p.tasks.flatMap((t) => t.split(' + ')));
    assert.equal(scheduled.length + c.dropped.length, totalTasks - 1);
    assert.ok(!scheduled.includes(rm.phases[0].tasks[0]) || rm.phases.flatMap((p) => p.tasks).filter((t) => t === rm.phases[0].tasks[0]).length > 1, 'completed task not rescheduled');
    for (const p of c.rebalancedPhases) for (const k of ['phaseTitle', 'focus', 'tasks']) assert.ok(k in p);
  });
  await test('v3 roadmap: pace from progress.done (EWMA), day derived from createdAt', async () => {
    const start = new Date(Date.now() - 9 * 864e5).toISOString().slice(0, 10);
    const v3 = roadmaps['TCF-B2-30'];
    const { out: r, calls } = await callsDuring(() => post('/api/coach', { roadmap: { ...v3, createdAt: start, progress: { done: {} } } }));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.method, 'progress_v1');
    assert.equal(r.json.onTrack, false);
    assert.ok(typeof r.json.requiredPace === 'number' && r.json.requiredPace > 0);
    assert.ok(r.json.rebalancedPhases.flatMap((p) => p.tasks).every((t) => /^Day \d+ — /.test(t)), 'remaining calendar tasks only');
    assert.ok(calls.length <= 3);
  });
  await test('behind + coach LLM down -> deterministic even spread', async () => {
    await llmControl({ fail: ['COACH'] });
    try {
      const r = await post('/api/coach', { roadmap: rm, daysElapsed: 15 });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.source, 'fallback');
      assert.equal(r.json.rebalancedPhases.reduce((n, p) => n + p.days, 0), 15);
      assert.equal(r.json.rebalancedPhases.flatMap((p) => p.tasks).length, totalTasks);
    } finally {
      await llmControl({ fail: [] });
    }
  });

  section('Practice generator');
  for (const skill of ['listening', 'reading', 'grammar', 'vocabulary', 'writing', 'speaking']) {
    await test(`practice TCF B2 ${skill} x4`, async () => {
      const r = await post('/api/practice', { exam: 'TCF', level: 'B2', skill, count: 4 });
      assert.equal(r.status, 200, r.text);
      const d = r.json;
      assert.match(d.disclaimer, /Unofficial/);
      assert.equal(d.items.length, 4);
      for (const it of d.items) {
        for (const k of ['id', 'skill', 'prompt', 'answer', 'explanation']) assert.ok(k in it, `item.${k}`);
        assert.equal(it.skill, skill);
        if (['writing', 'speaking'].includes(skill)) {
          assert.ok(it.checklist.length >= 3);
          assert.equal(it.answer, it.modelAnswer);
        } else {
          assert.equal(it.options.length, 4);
          assert.equal(it.answer, it.options[it.answerIndex]);
        }
        if (skill === 'listening') assert.ok(it.transcript.split(' ').length >= 15);
      }
      const doc = await docData('practice_sets', `TCF-B2-${skill}-4`);
      assert.equal(doc.sets.length, 1);
    });
  }
  await test('practice in German and English, with an invalid first LLM reply retried', async () => {
    await llmControl({ invalidOnce: ['PRACTICE'] });
    const { out: r, calls } = await callsDuring(() => post('/api/practice', { exam: 'GOETHE', level: 'A2', skill: 'reading', count: 2 }));
    assert.equal(r.status, 200, r.text);
    assert.ok(calls.some((c) => c.retry), 'validator feedback retry happened');
    const e = await post('/api/practice', { exam: 'IELTS', level: 'C1', skill: 'writing', count: 2 });
    assert.equal(e.status, 200, e.text);
  });
  await test('LLM down and nothing cached -> 503 with disclaimer; cached key still served', async () => {
    await llmControl({ fail: ['PRACTICE'] });
    try {
      const r = await post('/api/practice', { exam: 'IELTS', level: 'A1', skill: 'speaking', count: 2 });
      assert.equal(r.status, 503, r.text);
      assert.equal(r.json.status, 'failed');
      assert.match(r.json.disclaimer, /Unofficial/);
      const c = await post('/api/practice', { exam: 'TCF', level: 'B2', skill: 'reading', count: 4 });
      assert.equal(c.status, 200);
      assert.equal(c.json.source, 'cache');
    } finally {
      await llmControl({ fail: [] });
    }
  });

  section('Library + link checks');
  await test('GET /api/library returns approved, reachable resources with filters', async () => {
    const r = await get('/api/library?exam=TCF');
    assert.equal(r.status, 200, r.text);
    assert.ok(r.json.resources.length >= 3);
    for (const x of r.json.resources) {
      for (const k of ['id', 'title', 'url', 'category', 'skills', 'exams', 'levels', 'license', 'linkStatus', 'httpCode', 'lastCheckedAt', 'usageCount']) assert.ok(k in x, `library.${k}`);
      assert.ok(x.exams.includes('TCF') && onAllowlist(x.url) && isoOrNull(x.lastCheckedAt));
    }
    const f = await get('/api/library?exam=tcf&level=B2&skill=listening');
    assert.equal(f.status, 200);
    assert.ok(f.json.resources.length >= 1 && f.json.resources.every((x) => x.skills.includes('listening')));
    const none = await get('/api/library?exam=TEF');
    assert.deepEqual(none.json.resources, []);
    // level -> served from the precomputed shelf (ranked, CDN-cacheable)
    const shelf = await get('/api/library?exam=TCF&level=B2');
    assert.equal(shelf.status, 200, shelf.text);
    assert.ok(typeof shelf.json.shelfVersion === 'number');
    assert.match(shelf.headers.get('cache-control'), /s-maxage=600/);
    assert.ok(shelf.json.resources.every((x, i, a) => i === 0 || a[i - 1].rank < x.rank));
    assert.ok(await docData('shelves', 'TCF_B2'));
  });
  await test('check-link: good (ok), 404 (dead), off-allowlist (no request made)', async () => {
    const ok = await get(`/api/check-link?url=${encodeURIComponent('https://ielts.org')}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'ok');
    assert.equal(ok.json.httpCode, 200);
    assert.match(ok.headers.get('cache-control'), /s-maxage=86400/);
    const dead = await get(`/api/check-link?url=${encodeURIComponent('https://www.goethe.de/this-page-does-not-exist-openexam-e2e')}`);
    assert.equal(dead.json.status, 'dead');
    assert.equal(dead.json.httpCode, 404);
    const off = await get(`/api/check-link?url=${encodeURIComponent('https://evil.example.com/phish')}`);
    assert.equal(off.json.status, 'off_allowlist');
    assert.equal(off.json.httpCode, null);
    const sneaky = await get(`/api/check-link?url=${encodeURIComponent('https://goethe.de.evil.example.com/')}`);
    assert.equal(sneaky.json.status, 'off_allowlist');
  });

  section('Donation webhooks (ledger)');
  const sign = (b) => `sha256=${createHmac('sha256', 'gh-secret-e2e').update(b).digest('hex')}`;
  const ghBody = JSON.stringify({ action: 'created', sponsorship: { privacy_level: 'public', sponsor: { login: 'octocat' }, tier: { name: 'Supporter', monthly_price_in_cents: 500, is_one_time: false } } });
  const delivery = randomUUID();
  const gh = (body, sig, extra = {}) => http('POST', '/api/webhooks/github-sponsors', { raw: body, headers: { 'content-type': 'application/json', 'x-github-event': 'sponsorship', 'x-github-delivery': delivery, 'x-hub-signature-256': sig, ...extra } });
  await test('GitHub Sponsors: ping, signed event counted once, duplicate ignored, bad signature 401', async () => {
    const ping = await http('POST', '/api/webhooks/github-sponsors', { raw: '{"zen":"hi"}', headers: { 'content-type': 'application/json', 'x-github-event': 'ping', 'x-hub-signature-256': sign('{"zen":"hi"}') } });
    assert.equal(ping.status, 200, ping.text);
    const a = await gh(ghBody, sign(ghBody));
    assert.equal(a.status, 200, a.text);
    assert.deepEqual([a.json.duplicate, a.json.counted, a.json.amountEur], [false, true, 4.6]);
    const b = await gh(ghBody, sign(ghBody));
    assert.equal(b.status, 200);
    assert.equal(b.json.duplicate, true);
    const bad = await gh(ghBody.replace('500', '50000'), sign(ghBody), { 'x-github-delivery': randomUUID() });
    assert.equal(bad.status, 401, bad.text);
    const led = await docData('treasury', 'monthly_ledger');
    assert.equal(led.githubSponsors, 4.6);
    assert.equal(led.communityTotalEur, 4.6);
    assert.equal(led.month, new Date().toISOString().slice(0, 7));
    const ev = await docData('ledger_events', `github-${delivery}`);
    assert.equal(ev.contributor, '@octocat');
    assert.equal(ev.amountEur, 4.6);
    assert.equal(ev.currency, 'USD');
    assert.equal((await pub().collection('ledger_events').get()).size, 1);
  });
  await test('GitHub Sponsors form-encoded delivery (payload=) also verifies', async () => {
    const body = new URLSearchParams({ payload: JSON.stringify({ action: 'created', sponsorship: { privacy_level: 'private', tier: { name: 'Once', monthly_price_in_cents: 1000, is_one_time: true } } }) }).toString();
    const r = await http('POST', '/api/webhooks/github-sponsors', { raw: body, headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-github-event': 'sponsorship', 'x-github-delivery': randomUUID(), 'x-hub-signature-256': sign(body) } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.counted, true);
    assert.equal((await docData('treasury', 'monthly_ledger')).githubOneTime, 9.2);
  });
  await test('Ko-fi: donation counted, no PII stored, bad token 401, concurrent duplicates counted once', async () => {
    const data = { verification_token: 'kofi-token-e2e', message_id: `kofi-${randomUUID()}`, type: 'Donation', amount: '3.00', currency: 'EUR', from_name: 'Ana', is_public: true, message: 'Merci !', email: 'ana@example.com', kofi_transaction_id: 'tx-1' };
    const send = (d) => http('POST', '/api/webhooks/kofi', { raw: new URLSearchParams({ data: JSON.stringify(d) }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const rs = await Promise.all([send(data), send(data), send(data)]);
    for (const r of rs) assert.equal(r.status, 200, r.text);
    assert.equal(rs.filter((r) => r.json.counted).length, 1, 'exactly one counted');
    assert.equal(rs.filter((r) => r.json.duplicate).length, 2);
    const ev = await docData('ledger_events', `kofi-${data.message_id}`);
    assert.equal(ev.contributor, 'Ana');
    assert.ok(!JSON.stringify(ev).includes('ana@example.com'), 'email never stored');
    const led = await docData('treasury', 'monthly_ledger');
    assert.equal(led.koFiTips, 3);
    assert.equal(led.communityTotalEur, 16.8);
    const bad = await send({ ...data, message_id: 'kofi-other', verification_token: 'wrong' });
    assert.equal(bad.status, 401);
  });
  await test('Open Collective: wrong URL token 401; non-transaction activity ignored', async () => {
    const r1 = await http('POST', '/api/webhooks/open-collective?token=nope', { raw: '{}', headers: { 'content-type': 'application/json' } });
    assert.equal(r1.status, 401);
    const r2 = await http('POST', '/api/webhooks/open-collective?token=oc-token-e2e', { raw: JSON.stringify({ type: 'collective.member.created' }), headers: { 'content-type': 'application/json' } });
    assert.equal(r2.status, 200, r2.text);
    assert.ok(r2.json.ignored);
  });

  section('Cron link maintenance');
  await test('cron recheck: live re-check of every link, dead link disabled, cached roadmaps invalidated', async () => {
    const deadUrl = 'https://www.goethe.de/this-page-does-not-exist-openexam-e2e';
    const deadId = 'ffffffffffffffffffffffff';
    const { Timestamp } = await import('firebase-admin/firestore');
    await pub().collection('resources').doc(deadId).set({ url: deadUrl, title: 'Gone', category: 'x', skills: ['reading'], exams: ['GOETHE'], levels: [], license: 'x', linkStatus: 'ok', httpCode: 200, approved: true, consecutiveDead: 1, lastCheckedAt: Timestamp.fromMillis(0), usageCount: 0 });
    await pub().collection('global_verified_roadmaps').doc('GOETHE-B1-99').set({ serverVerified: true, pipelineVersion: 2, cachedAt: new Date().toISOString(), roadmap: { verifiedResources: [{ id: deadId, url: deadUrl }] } });
    await pub().collection('plans').doc('GOETHE_B1_7').set({ planKey: 'GOETHE_B1_7', pipelineVersion: 3, resourceIds: [deadId], cachedAt: new Date() });
    const total = (await pub().collection('resources').get()).size;
    const r = await get('/api/cron/recheck-links', { headers: { authorization: 'Bearer cron-secret-e2e' } });
    assert.equal(r.status, 200, r.text);
    const s = r.json.summary;
    assert.ok(s.checked >= 1 && s.checked < total, `only due links are checked (${s.checked}/${total})`);
    assert.ok(s.counts.dead >= 1);
    assert.deepEqual(s.newlyDisabled.map((x) => x.id), [deadId]);
    assert.deepEqual([...s.invalidatedRoadmaps].sort(), ['GOETHE-B1-99', 'plans/GOETHE_B1_7']);
    const d = await docData('resources', deadId);
    assert.equal(d.approved, false);
    assert.equal(d.linkStatus, 'dead');
    assert.equal(d.consecutiveDead, 2);
    assert.equal(await docData('global_verified_roadmaps', 'GOETHE-B1-99'), undefined);
    assert.equal(await docData('plans', 'GOETHE_B1_7'), undefined);
    assert.ok(await docData('plans', 'GOETHE_B1_30'), 'unrelated cache kept');
    assert.ok(d.nextCheckAt?.toMillis() > Date.now(), 'next check scheduled');
    assert.ok(await docData('metrics', 'link_health'));
    assert.equal(r.json.ledger.month, new Date().toISOString().slice(0, 7));
  });

  section('Admin: expand, approve, review-profile');
  let pendingIds = [];
  await test('expand TEF: allowlisted+live candidates saved unapproved, others rejected with reasons', async () => {
    const r = await post('/api/admin/expand', { exam: 'TEF', levels: ['B1', 'B2'] }, { headers: admin });
    assert.equal(r.status, 200, r.text);
    const x = r.json;
    assert.ok(x.rejected.some((j) => /off_allowlist/.test(j.reason)));
    assert.ok(x.rejected.some((j) => /dead/.test(j.reason)));
    assert.ok(x.saved.length >= 2);
    pendingIds = x.saved.filter((s) => !s.approved).map((s) => s.id);
    assert.ok(pendingIds.length >= 1, 'some new candidates await review');
    for (const s of x.saved) {
      const d = await docData('resources', s.id);
      assert.equal(d.approved, s.approved, `reported approved flag matches Firestore for ${s.url}`);
      assert.ok(d.exams.includes('TEF'));
    }
    for (const id of pendingIds) assert.equal((await docData('resources', id)).addedBy, 'expansion');
    assert.ok(x.suggestedDomains.some((d) => d.domain === 'lefrancaisdesaffaires.fr' && d.alreadyAllowed === true), 'CCI Paris / Le français des affaires is already on the official allowlist');
    const lib = await get('/api/library?exam=TEF');
    assert.ok(!lib.json.resources.some((y) => pendingIds.includes(y.id)), 'unapproved candidates are invisible');
  });
  await test('approve makes candidates visible; unknown ids reported not_found', async () => {
    const r = await post('/api/admin/approve', { resourceIds: [...pendingIds, '0123456789abcdef01234567'], approve: true }, { headers: admin });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.updated, pendingIds.length);
    assert.ok(r.json.results.some((x) => x.status === 'not_found'));
    const lib = await get('/api/library?exam=TEF');
    for (const id of pendingIds) assert.ok(lib.json.resources.some((y) => y.id === id));
  });
  await test('review-profile marks exam_profiles/TCF reviewed; served in new roadmaps; 404 for unknown', async () => {
    const r = await post('/api/admin/review-profile', { exam: 'tcf', reviewed: true }, { headers: admin });
    assert.equal(r.status, 200, r.text);
    assert.equal((await docData('exam_profiles', 'TCF')).reviewed, true);
    const g = await post('/api/generate-roadmap', { exam: 'TCF', level: 'C1', days: 20 });
    assert.equal(g.status, 200, g.text);
    assert.equal(g.json.roadmap.examProfile?.reviewed, true);
    const nf = await post('/api/admin/review-profile', { exam: 'DELE', reviewed: true }, { headers: admin });
    assert.equal(nf.status, 404);
  });

  section('Metrics');
  await test('metrics/usage records LLM calls per agent; pipeline counters are sharded', async () => {
    const m = await docData('metrics', 'usage');
    for (const a of ['PLANNER', 'DISCOVERY', 'DIAGNOSTIC', 'COACH', 'PRACTICE', 'EXPANSION', 'FORMAT']) assert.ok(m.calls[a] >= 1, `calls.${a}`);
    assert.ok((await counter('cacheHits')) >= 3);
    assert.ok((await counter('roadmapsGenerated')) >= 5);
    assert.ok((await counter('fallbackPlans')) >= 1);
  });
  await test('cron rollup: folds past usage buckets into resources, writes stats/public; GET /api/stats', async () => {
    // Move every bucket into the past hour so it is foldable now.
    for (const d of (await pub().collection('usage_buckets').get()).docs) {
      await pub().collection('usage_buckets').doc(`${d.id.split('_')[0]}_2000010100`).set(d.data(), { merge: true });
      await d.ref.delete();
    }
    const want = await usageTotals('u');
    const rid = Object.keys(want)[0];
    const before = (await docData('resources', rid)).usageCount || 0;
    const r = await get('/api/cron/rollup', { headers: { authorization: 'Bearer cron-secret-e2e' } });
    assert.equal(r.status, 200, r.text);
    assert.equal((await docData('resources', rid)).usageCount, before + want[rid]);
    assert.equal((await pub().collection('usage_buckets').get()).size, 0);
    const again = await get('/api/cron/rollup', { headers: { authorization: 'Bearer cron-secret-e2e' } });
    assert.equal(again.status, 200);
    assert.equal((await docData('resources', rid)).usageCount, before + want[rid], 'idempotent');
    const st = await get('/api/stats');
    assert.equal(st.status, 200, st.text);
    assert.ok(st.json.stats.approvedResources >= 9 && st.json.stats.plansBuilt >= 5, JSON.stringify(st.json));
    assert.match(st.headers.get('cache-control'), /s-maxage=300/);
    const noAuth = await get('/api/cron/rollup');
    assert.equal(noAuth.status, 401);
  });
  await test('migrate-v3: dry run writes nothing; --write on the emulator backfills; second run is a no-op', async () => {
    const { Timestamp } = await import('firebase-admin/firestore');
    // A legacy-shaped doc (no v3 fields), like the 9 resources seeded in prod before v3.
    await pub().collection('resources').doc('legacy00000000000000000a').set({ url: 'https://www.goethe.de/de/spr/kup/prf.html?b=1&a=2', title: 'Legacy Goethe', category: 'x', skills: ['reading'], exams: ['GOETHE'], levels: [], license: 'x', linkStatus: 'ok', httpCode: 200, approved: true, lastCheckedAt: Timestamp.now(), usageCount: 4 });
    const snapBefore = JSON.stringify((await pub().collection('resources').get()).docs.map((d) => [d.id, d.data()]));
    const dry = await runNode('scripts/migrate-v3.mjs');
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.out, /DRY RUN/i);
    assert.equal(JSON.stringify((await pub().collection('resources').get()).docs.map((d) => [d.id, d.data()])), snapBefore, 'dry run wrote nothing');
    const w = await runNode('scripts/migrate-v3.mjs', ['--write']);
    assert.equal(w.code, 0, w.out);
    const old = await docData('resources', 'legacy00000000000000000a');
    assert.equal(old.approved, false);
    assert.match(old.duplicateOf, /^[0-9a-f]{24}$/);
    const moved = await docData('resources', old.duplicateOf);
    assert.equal(moved.usageCount, 4); assert.ok(moved.dedupKey && moved.shelfKeys.includes('GOETHE_B1') && moved.nextCheckAt);
    const all = (await pub().collection('resources').get()).docs.map((d) => d.data());
    assert.ok(all.every((x) => x.site && x.dedupKey && Array.isArray(x.shelfKeys) && x.nextCheckAt), 'every doc backfilled');
    const second = await runNode('scripts/migrate-v3.mjs', ['--write']);
    assert.equal(second.code, 0, second.out);
    assert.match(second.out, /field updates: 0; id moves: 0; near-duplicate clusters: 0/, second.out);
  });

  section('Firestore security rules (client SDK against the emulator)');
  await test('clients cannot write public data; owners can write only their own roadmaps', async () => {
    const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
    const { doc, setDoc, getDoc, updateDoc, deleteDoc, setLogLevel, deleteField } = await import('firebase/firestore');
    setLogLevel('silent'); // denied writes are expected; keep the output readable
    const [host, port] = EMU.split(':');
    const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host, port: Number(port), rules: readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') } });
    try {
      const alice = env.authenticatedContext('alice').firestore();
      const bob = env.authenticatedContext('bob').firestore();
      const anon = env.unauthenticatedContext().firestore();
      const base = `artifacts/${APP_ID}`;
      // public data: readable, never writable (not even signed in)
      await assertSucceeds(getDoc(doc(anon, `${base}/public/data/treasury/monthly_ledger`)));
      await assertSucceeds(getDoc(doc(alice, `${base}/public/data/resources/${rfiId}`)));
      await assertFails(setDoc(doc(alice, `${base}/public/data/treasury/monthly_ledger`), { communityTotalEur: 1e9 }));
      await assertFails(updateDoc(doc(alice, `${base}/public/data/resources/${rfiId}`), { approved: true }));
      await assertFails(setDoc(doc(alice, `${base}/public/data/global_verified_roadmaps/TCF-B2-30`), { roadmap: {}, serverVerified: true }));
      await assertFails(setDoc(doc(anon, `${base}/public/data/ledger_events/fake`), { amount: 1000 }));
      await assertFails(deleteDoc(doc(alice, `${base}/public/data/metrics/usage`)));
      // own roadmap: valid shape succeeds, then ticking a task
      const mine = doc(alice, `${base}/users/alice/roadmaps/TCF-B2-30`);
      const { pipeline, ...r } = rm;
      await assertSucceeds(setDoc(mine, { ...r, pipeline: pipeline.slice(0, 40) }));
      await assertSucceeds(updateDoc(mine, { completedTasks: { '0-0': true } }));
      await assertSucceeds(getDoc(mine));
      await assertFails(setDoc(doc(alice, `${base}/users/alice/roadmaps/bad`), { exam: 'TCF', level: 'Z9', days: 30, phases: [] }));
      await assertFails(setDoc(doc(alice, `${base}/users/alice/roadmaps/other-id`), { ...r, pipeline: [], id: 'TCF-B2-30' }));
      // someone else: no read, no write, no delete
      await assertFails(getDoc(doc(bob, `${base}/users/alice/roadmaps/TCF-B2-30`)));
      await assertFails(setDoc(doc(bob, `${base}/users/alice/roadmaps/x`), { exam: 'TCF', level: 'B2', days: 30, phases: [] }));
      await assertFails(deleteDoc(doc(bob, `${base}/users/alice/roadmaps/TCF-B2-30`)));
      await assertFails(setDoc(doc(anon, `${base}/users/alice/roadmaps/y`), { exam: 'TCF', level: 'B2', days: 30, phases: [] }));
      // private sub-collections
      await assertSucceeds(setDoc(doc(alice, `${base}/users/alice/settings/prefs`), { theme: 'warm' }));
      await assertFails(getDoc(doc(bob, `${base}/users/alice/settings/prefs`)));
      // v3: per-task ticks via field paths, validated progress map
      await assertSucceeds(updateDoc(mine, { 'progress.done.d1t0': Math.floor(Date.now() / 1000) }));
      await assertSucceeds(updateDoc(mine, { 'progress.done.d1t0': deleteField() }));
      await assertFails(updateDoc(mine, { progress: { done: 'all' } }));
      await assertFails(updateDoc(mine, { progress: { done: {}, hacked: true } }));
      await assertFails(updateDoc(mine, { calendar: Array.from({ length: 181 }, () => 's') }));
      // public lists must be bounded (the App's ledger feed uses orderBy createdAt desc + limit 20)
      const { collection, query, orderBy, limit, where, getDocs } = await import('firebase/firestore');
      await assertSucceeds(getDocs(query(collection(anon, `${base}/public/data/ledger_events`), orderBy('createdAt', 'desc'), limit(20))));
      await assertFails(getDocs(collection(anon, `${base}/public/data/ledger_events`)));
      await assertFails(getDocs(query(collection(anon, `${base}/public/data/resources`), limit(500))));
      await assertFails(getDoc(doc(anon, `${base}/public/data/usage_buckets/x`)));
      await assertFails(getDoc(doc(anon, `${base}/public/data/counters/cacheHits`)));
      await assertSucceeds(getDoc(doc(anon, `${base}/public/data/plans/TCF_B2_30`)));
      // SRS cards: one doc each, validated; the App's deck query (exam ==, limit 200)
      const card = { id: 'TCF_0a1b2c3d', exam: 'TCF', skill: 'reading', front: 'Q', back: 'A', state: 'new', due: Date.now(), stability: 0, difficulty: 0, reps: 0, lapses: 0, source: 'practice', createdAt: Date.now() };
      await assertSucceeds(setDoc(doc(alice, `${base}/users/alice/srs/TCF_0a1b2c3d`), card));
      await assertSucceeds(setDoc(doc(alice, `${base}/users/alice/srs/TCF_0a1b2c3d`), { ...card, state: 'review', stability: 3.17, difficulty: 5.2, reps: 1, lastReview: Date.now(), interval: 3, retrievability: 0 }));
      await assertFails(setDoc(doc(alice, `${base}/users/alice/srs/TCF_bad`), { ...card, id: 'TCF_bad', state: 'mastered' }));
      await assertFails(setDoc(doc(alice, `${base}/users/alice/srs/TCF_bad2`), { ...card, id: 'TCF_bad2', evil: 1 }));
      await assertFails(setDoc(doc(bob, `${base}/users/alice/srs/TCF_x`), { ...card, id: 'TCF_x' }));
      await assertSucceeds(getDocs(query(collection(alice, `${base}/users/alice/srs`), where('exam', '==', 'TCF'), limit(200))));
    } finally {
      await env.cleanup();
    }
  });
}

main()
  .catch((err) => {
    results.push({ name: `harness (${current})`, ok: false, err });
    console.error('\nHarness error:', err?.stack || err);
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
    if (failed.length) {
      console.log('Failed:', failed.map((f) => f.name).join(' | '));
      const api = children.find((c) => c.name === 'api');
      if (api?.log) console.log('\n--- api server log (tail) ---\n' + api.log.slice(-4000));
    }
    stopAll();
    setTimeout(() => process.exit(failed.length ? 1 : 0), 300);
  });
