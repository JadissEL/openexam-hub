/**
 * Emulator-only: count registered Firebase Auth users (excluding anonymous and
 * deleted accounts) and expose them on GET /api/stats as registeredUsers.
 * Uses demo-openexam and free ports (never 8085/9099). Never talks to production.
 *
 *   node scripts/test-users-emulator.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PROJECT = 'demo-openexam';

if (process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_PROJECT_ID.startsWith('demo-')) {
  console.error('Refusing to run: FIREBASE_PROJECT_ID must start with demo-');
  process.exit(2);
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

async function pickPort(start) {
  for (let p = start; p < start + 40; p++) {
    if (p === 8085 || p === 9099) continue;
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

const fsPort = await pickPort(8110);
const authPort = await pickPort(9210);
const dir = mkdtempSync(join(tmpdir(), 'oeh-users-emu-'));
const cfgPath = join(dir, 'firebase.json');
writeFileSync(
  cfgPath,
  JSON.stringify(
    {
      firestore: {
        database: '(default)',
        rules: join(ROOT, 'firestore.rules'),
        indexes: join(ROOT, 'firestore.indexes.json')
      },
      emulators: {
        firestore: { host: '127.0.0.1', port: fsPort },
        auth: { host: '127.0.0.1', port: authPort },
        ui: { enabled: false }
      }
    },
    null,
    2
  )
);

process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${fsPort}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${authPort}`;
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.GCLOUD_PROJECT = PROJECT;
process.env.APP_ID = 'openexam-hub';
delete process.env.FIREBASE_SERVICE_ACCOUNT;

console.log(`starting Auth+Firestore emulators on ${authPort}/${fsPort} (project ${PROJECT})…`);
const bin = join(ROOT, 'node_modules/.bin/firebase');
const child = spawn(bin, ['emulators:start', '--only', 'auth,firestore', '--project', PROJECT, '--config', cfgPath], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', (d) => process.stdout.write(d));
child.stderr.on('data', (d) => process.stderr.write(d));

try {
  await waitHttp(`http://127.0.0.1:${fsPort}/`);
  await waitHttp(`http://127.0.0.1:${authPort}/`);

  const { getDb, pub } = await import('../lib/firebaseAdmin.js');
  getDb(); // initialise the demo-openexam admin app against the emulators
  const { getAuth } = await import('firebase-admin/auth');
  const { getRegisteredUsers, listRegisteredUserCount, USERS_DOC_ID } = await import('../lib/userCount.js');
  const statsHandler = (await import('../lib/routes/stats.js')).default;

  const auth = getAuth();
  const a = await auth.createUser({ email: 'learner-a@example.com', password: 'test-pass-12' });
  const b = await auth.createUser({ email: 'learner-b@example.com', password: 'test-pass-12' });
  const anon = await auth.createUser({}); // no email/phone/providers: treated as anonymous
  assert.equal(await listRegisteredUserCount(), 2, 'anonymous placeholder is excluded');

  await auth.deleteUser(b.uid);
  assert.equal(await listRegisteredUserCount(), 1, 'deleted accounts are not counted');

  // Force a recount (no fresh cache).
  await pub().collection('stats').doc(USERS_DOC_ID).delete().catch(() => {});
  const n = await getRegisteredUsers({ now: Date.now() });
  assert.equal(n, 1);

  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  await statsHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.registeredUsers, 1);

  // Keep the ids referenced so the create calls are obviously used.
  assert.ok(a.uid && anon.uid);
  console.log('emulator registeredUsers count ok (2 created, 1 anonymous ignored, 1 deleted, 1 remaining)');
} finally {
  child.kill('SIGTERM');
}
