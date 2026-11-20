#!/usr/bin/env node
/**
 * Emulator integration test for the founder's new-signup alert:
 * POST /api/account {action:'signup-notify'} + the nightly sweep. Talks ONLY to the Firebase
 * emulators (project demo-openexam) and a local mock of the Resend API; nothing leaves the machine.
 *
 *   npm run test:signup-alert
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!AUTH_HOST || !FS_HOST) throw new Error('Run inside firebase emulators:exec (auth + firestore).');
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-openexam';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIREBASE_PROJECT_ID = PROJECT;
const PORT = 3418;
const MOCK_PORT = 3419;
const API = `http://127.0.0.1:${PORT}`;

// ---- mock Resend
const mails = [];
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    mails.push({ auth: req.headers.authorization, body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: `mock_${mails.length}` }));
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));
const RESEND_ENV = { RESEND_API_KEY: 'test-key', RESEND_API_URL: `http://127.0.0.1:${MOCK_PORT}/emails`, SIGNUP_ALERT_TO: 'founder@demo.local' };
Object.assign(process.env, RESEND_ENV);

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok   ${name}`);
}
async function idp(pathname, body) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/${pathname}?key=demo-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json();
  assert.ok(j.idToken, JSON.stringify(j));
  return { uid: j.localId, token: j.idToken };
}
const signUp = (email) => idp('accounts:signUp', email ? { email, password: 'test-pass-123', returnSecureToken: true } : { returnSecureToken: true });

await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const server = spawn(process.execPath, ['scripts/local-server.mjs', String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, ...RESEND_ENV, LOCAL_SERVER_QUIET: '1', FIREBASE_SERVICE_ACCOUNT: '' },
  stdio: ['ignore', 'inherit', 'inherit']
});
for (let i = 0; i < 50; i++) {
  try { await fetch(`${API}/api/stats`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
}

const { getDb, APP_ID } = await import('../lib/firebaseAdmin.js');
const { getAuth } = await import('firebase-admin/auth');
const { sweepMissedSignups } = await import('../lib/signupAlert.js');
const db = getDb();
const claim = (uid) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('signup_alerts').doc(uid);
const notify = (token, extra = {}) => fetch(`${API}/api/account`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ action: 'signup-notify', exam: 'tef-canada', locale: 'fr-CA', timeZone: 'America/Toronto', ...extra })
});

try {
  const older = await signUp('first@demo.local');
  const a = await signUp('newbie@demo.local');

  await check('signup-notify: no token -> 401, no email', async () => {
    assert.equal((await notify(null)).status, 401);
    assert.equal(mails.length, 0);
  });
  await check('signup-notify: anonymous token -> 401, no email', async () => {
    const anon = await signUp(null);
    assert.equal((await notify(anon.token)).status, 401);
    assert.equal(mails.length, 0);
  });
  await check('signup-notify: new account -> one branded email with real counts, masked email', async () => {
    const r = await notify(a.token);
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.status, 'sent', JSON.stringify(j));
    assert.equal(mails.length, 1);
    const m = mails[0];
    assert.equal(m.auth, 'Bearer test-key');
    assert.deepEqual(m.body.to, ['founder@demo.local']);
    assert.equal(m.body.from, 'OpenExam Hub <notifications@openexamhub.org>');
    assert.match(m.body.subject, /learner #2\b/); // 2 registered users (anonymous excluded)
    assert.ok(m.body.html.includes('n***@demo.local'));
    assert.ok(!m.body.html.includes('newbie@demo.local'));
    assert.ok(m.body.html.includes('TEF Canada'));
    assert.ok(m.body.html.includes('Email &amp; password'));
    assert.match(m.body.text, /Learners total: 2/);
    assert.match(m.body.text, /Joined today: 2/);
    assert.ok((await claim(a.uid).get()).exists);
  });
  await check('signup-notify: replay -> duplicate, still one email', async () => {
    const j = await (await notify(a.token)).json();
    assert.equal(j.status, 'duplicate');
    assert.equal(mails.length, 1);
  });
  await check('signup-notify: account older than 24h -> not-new, no email', async () => {
    const uid = 'old-user';
    await getAuth().importUsers([{ uid, email: 'old@demo.local', metadata: { creationTime: new Date(Date.now() - 3 * 864e5).toUTCString(), lastSignInTime: new Date().toUTCString() } }]);
    const custom = await getAuth().createCustomToken(uid);
    const { token } = await idp('accounts:signInWithCustomToken', { token: custom, returnSecureToken: true });
    const j = await (await notify(token)).json();
    assert.equal(j.status, 'not-new');
    assert.equal(mails.length, 1);
    assert.equal((await claim(uid).get()).exists, false);
  });
  await check('nightly sweep: alerts the account whose live call never happened, once', async () => {
    const r = await sweepMissedSignups();
    assert.equal(r.sent, 1, JSON.stringify(r)); // "first@" never called signup-notify
    assert.equal(mails.length, 2);
    assert.ok(mails[1].body.html.includes('f***@demo.local'));
    assert.match(mails[1].body.html, /nightly check/);
    assert.ok((await claim(older.uid).get()).exists);
    const again = await sweepMissedSignups();
    assert.equal(again.sent, 0);
    assert.equal(mails.length, 2);
  });
  await check('delete action still works on the same route', async () => {
    const r = await fetch(`${API}/api/account`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ action: 'delete', confirm: 'DELETE' })
    });
    assert.equal(r.status, 200);
  });
  console.log(`\n${passed} signup-alert emulator checks passed`);
} finally {
  server.kill();
  mock.close();
}
process.exit(0);
