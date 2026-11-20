#!/usr/bin/env node
/**
 * Emulator test for POST /api/account (self-service account deletion) and, when the cleanup
 * route exists, GET /api/cron/cleanup. Talks ONLY to the Firebase emulators (project demo-openexam).
 *
 *   npx firebase emulators:exec --only auth,firestore --project demo-openexam --config firebase.json \
 *     "node scripts/test-account-emulator.mjs"
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!AUTH_HOST || !FS_HOST) throw new Error('Run inside firebase emulators:exec (auth + firestore).');
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-openexam';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIREBASE_PROJECT_ID = PROJECT;
const PORT = 3417;
const API = `http://127.0.0.1:${PORT}`;
const CRON_SECRET = 'test-cron-secret';

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok   ${name}`);
}

async function signUp(email) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(email ? { email, password: 'test-pass-123', returnSecureToken: true } : { returnSecureToken: true })
  });
  const j = await r.json();
  assert.ok(j.idToken, JSON.stringify(j));
  return { uid: j.localId, token: j.idToken };
}

const server = spawn(process.execPath, ['scripts/local-server.mjs', String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, LOCAL_SERVER_QUIET: '1', CRON_SECRET, FIREBASE_SERVICE_ACCOUNT: '' },
  stdio: ['ignore', 'inherit', 'inherit']
});
for (let i = 0; i < 50; i++) {
  try { await fetch(`${API}/api/stats`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
}

const { getDb, APP_ID } = await import('../lib/firebaseAdmin.js');
const { getAuth } = await import('firebase-admin/auth');
const db = getDb();
const userRef = (uid) => db.collection('artifacts').doc(APP_ID).collection('users').doc(uid);
async function seed(uid) {
  await userRef(uid).set({ displayName: 'Test' });
  await userRef(uid).collection('roadmaps').doc('r1').set({ exam: 'IELTS', level: 'B2', days: 30, phases: [] });
  await userRef(uid).collection('roadmaps').doc('r2').set({ exam: 'TCF', level: 'B1', days: 14, phases: [] });
  await userRef(uid).collection('srs').doc('c1').set({ state: 'new', due: 1 });
  await userRef(uid).collection('placement').doc('IELTS').set({ targetLevel: 'B2', responses: [] });
}
async function countTree(uid) {
  let n = (await userRef(uid).get()).exists ? 1 : 0;
  for (const c of await userRef(uid).listCollections()) n += (await c.get()).size;
  return n;
}
const post = (body, token) => fetch(`${API}/api/account`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body)
});

try {
  const a = await signUp('delete-me@demo.local');
  const b = await signUp('keep-me@demo.local');
  await seed(a.uid);
  await seed(b.uid);

  await check('account: no token -> 401', async () => {
    assert.equal((await post({ action: 'delete', confirm: 'DELETE' })).status, 401);
  });
  await check('account: wrong confirmation -> 400, nothing deleted', async () => {
    assert.equal((await post({ action: 'delete', confirm: 'delete' }, a.token)).status, 400);
    assert.equal(await countTree(a.uid), 5);
  });
  await check('account: anonymous token -> 401', async () => {
    const anon = await signUp(null);
    assert.equal((await post({ action: 'delete', confirm: 'DELETE' }, anon.token)).status, 401);
  });
  await check('account: GET -> 405', async () => {
    assert.equal((await fetch(`${API}/api/account`, { headers: { authorization: `Bearer ${a.token}` } })).status, 405);
  });
  await check('account: DELETE confirmed -> data + auth user gone, other user untouched', async () => {
    const r = await post({ action: 'delete', confirm: 'DELETE' }, a.token);
    assert.equal(r.status, 200, await r.text());
    assert.equal(await countTree(a.uid), 0);
    await assert.rejects(getAuth().getUser(a.uid), (e) => e.code === 'auth/user-not-found');
    assert.equal(await countTree(b.uid), 5);
    assert.ok(await getAuth().getUser(b.uid));
  });

  // ------------------------------------------------------------ nightly cleanup (if present)
  const { ROUTES } = await import('../api/cron/[job].js');
  if (ROUTES.cleanup) {
    const { runCleanup } = await import('../lib/routes/cron/cleanup.js');
    const pub = db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
    const past = new Date(Date.now() - 864e5);
    const future = new Date(Date.now() + 864e5);
    for (const c of ['plans', 'usage_buckets', 'calib_buckets', 'link_checks']) {
      await pub.collection(c).doc('old').set({ expireAt: past });
      await pub.collection(c).doc('fresh').set({ expireAt: future });
    }
    await pub.collection('plans').doc('noexp').set({ cachedAt: new Date() });
    const oldAnon = await signUp(null);
    const newAnon = await signUp(null);
    await seed(oldAnon.uid);
    await seed(newAnon.uid);
    const NOW = Date.now() + 8 * 864e5; // pretend a week+ has passed for the "old" one only
    // newAnon is treated as fresh by backdating the cutoff relative to its creation
    const newMeta = await getAuth().getUser(newAnon.uid);
    const realUser = b;

    await check('cleanup: unauthorised cron call -> 401', async () => {
      assert.equal((await fetch(`${API}/api/cron/cleanup`)).status, 401);
    });
    await check('cleanup: dry run counts only, deletes nothing', async () => {
      const r = await runCleanup({ dryRun: true, now: NOW, isFresh: (u) => u.uid === newMeta.uid });
      assert.equal(r.dryRun, true);
      assert.equal(r.expiredCache.total, 4);
      assert.ok(r.anonymousUsers.matched >= 2, JSON.stringify(r)); // oldAnon + the 401-test anon
      assert.equal(r.anonymousUsers.deleted, 0);
      assert.ok((await pub.collection('plans').doc('old').get()).exists);
      assert.equal(await countTree(oldAnon.uid), 5);
    });
    await check('cleanup: HTTP dry run (?dry=1) with CRON_SECRET -> 200 counts', async () => {
      const r = await fetch(`${API}/api/cron/cleanup?dry=1`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
      const j = await r.json();
      assert.equal(r.status, 200, JSON.stringify(j));
      assert.equal(j.dryRun, true);
      assert.ok((await pub.collection('plans').doc('old').get()).exists);
    });
    await check('cleanup: real run deletes expired cache + old anonymous users and their data only', async () => {
      const r = await runCleanup({ dryRun: false, now: NOW, isFresh: (u) => u.uid === newMeta.uid });
      assert.equal(r.expiredCache.total, 4);
      for (const c of ['plans', 'usage_buckets', 'calib_buckets', 'link_checks']) {
        assert.equal((await pub.collection(c).doc('old').get()).exists, false, c);
        assert.equal((await pub.collection(c).doc('fresh').get()).exists, true, c);
      }
      assert.ok((await pub.collection('plans').doc('noexp').get()).exists);
      assert.equal(await countTree(oldAnon.uid), 0);
      await assert.rejects(getAuth().getUser(oldAnon.uid), (e) => e.code === 'auth/user-not-found');
      assert.equal(await countTree(newAnon.uid), 5);
      assert.ok(await getAuth().getUser(newAnon.uid));
      assert.equal(await countTree(realUser.uid), 5);
      assert.ok(await getAuth().getUser(realUser.uid));
    });
  }
  console.log(`\n${passed} checks passed`);
} finally {
  server.kill();
}
process.exit(0);
