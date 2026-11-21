/**
 * Emulator-only integration: record token usage into demo-openexam and read it back
 * through GET /api/stats. Never talks to the production openexam-hub project.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:PORT node scripts/test-usage-emulator.mjs
 *
 * Or let the script start a temporary emulator on a free port (default 8086).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PROJECT = 'demo-openexam';

if (process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_PROJECT_ID.startsWith('demo-')) {
  console.error('Refusing to run: FIREBASE_PROJECT_ID must start with demo-');
  process.exit(2);
}

async function portFree(port) {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

async function pickPort(start) {
  for (let p = start; p < start + 30; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error('no free port');
}

function waitHttp(url, ms = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (r.ok || r.status === 404) return resolve();
      } catch { /* still starting */ }
      if (Date.now() - started > ms) return reject(new Error(`timeout waiting for ${url}`));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const given = process.env.FIRESTORE_EMULATOR_HOST;
let child = null;
let emuHost = given;

if (!given) {
  const port = await pickPort(8086);
  // Avoid the repo firebase.json ports (8085 / 9099) in case another agent is using them later.
  const dir = mkdtempSync(join(tmpdir(), 'oeh-usage-emu-'));
  const cfg = {
    firestore: {
      database: '(default)',
      rules: join(ROOT, 'firestore.rules'),
      indexes: join(ROOT, 'firestore.indexes.json')
    },
    emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false } }
  };
  const cfgPath = join(dir, 'firebase.json');
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  emuHost = `127.0.0.1:${port}`;
  process.env.FIRESTORE_EMULATOR_HOST = emuHost;
  process.env.FIREBASE_PROJECT_ID = PROJECT;
  process.env.GCLOUD_PROJECT = PROJECT;
  process.env.APP_ID = 'openexam-hub';
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  console.log(`starting Firestore emulator on ${emuHost} (project ${PROJECT})…`);
  const bin = join(ROOT, 'node_modules/.bin/firebase');
  child = spawn(bin, ['emulators:start', '--only', 'firestore', '--project', PROJECT, '--config', cfgPath], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  await waitHttp(`http://${emuHost}/`);
} else {
  if (!given.includes(':')) {
    console.error('FIRESTORE_EMULATOR_HOST must be host:port');
    process.exit(2);
  }
  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || PROJECT;
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || PROJECT;
  process.env.APP_ID = process.env.APP_ID || 'openexam-hub';
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  console.log(`reusing Firestore emulator at ${given}`);
}

try {
  const { recordTokenUsage, setUsageClockForTests, usageDocId } = await import('../lib/usage.js');
  const { pub } = await import('../lib/firebaseAdmin.js');
  const statsHandler = (await import('../lib/routes/stats.js')).default;

  setUsageClockForTests(() => new Date('2026-11-20T21:30:00Z'));

  // Wipe any leftover docs from a previous demo-openexam run on this port.
  const monthRef = pub().collection('stats').doc(usageDocId('2026-11'));
  const totalRef = pub().collection('stats').doc('usage-total');
  await monthRef.delete().catch(() => {});
  await totalRef.delete().catch(() => {});

  await recordTokenUsage({
    agent: 'PLANNER',
    usage: { prompt_tokens: 250, completion_tokens: 80 },
    model: 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1'
  });

  await recordTokenUsage({
    agent: 'PLANNER',
    usage: { prompt_tokens: 50, completion_tokens: 20 },
    model: 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1'
  });

  const snap = await monthRef.get();
  assert.equal(snap.exists, true);
  assert.equal(snap.data().calls, 2);
  assert.equal(snap.data().promptTokens, 300);
  assert.equal(snap.data().completionTokens, 100);
  // Real Firestore: set(merge) with nested maps accumulates per provider/model (no literal dotted keys).
  assert.equal(snap.data().byProvider.groq.calls, 2);
  assert.equal(snap.data().byModel['openai_gpt-oss-120b'].calls, 2);
  assert.ok(!Object.keys(snap.data()).some((k) => k.includes('.')));
  const keys = Object.keys(snap.data());
  assert.ok(!keys.some((k) => /email|uid|user/i.test(k)));

  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  await statsHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.usage.month, '2026-11');
  assert.equal(res.body.usage.calls, 2);
  assert.equal(res.body.usage.promptTokens, 300);
  assert.equal(res.body.usage.completionTokens, 100);
  assert.equal(res.body.usage.byProvider.groq.calls, 2);
  assert.equal(res.body.usage.costEur, 0);
  assert.equal(res.body.usageTotal.calls, 2);
  assert.ok(res.body.treasury);
  console.log('emulator usage + /api/stats ok');
} finally {
  if (child) {
    child.kill('SIGTERM');
  }
}
