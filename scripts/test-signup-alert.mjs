// Offline tests for the founder's new-signup alert (lib/signupAlert.js + POST /api/account
// {action:'signup-notify'} dedupe logic). No network, no Firebase project: Firestore is faked via
// setPubForTests and Resend via a fake fetch. Run: node scripts/test-signup-alert.mjs
// Set SIGNUP_PREVIEW_OUT=/path/preview.html to also write a rendered sample.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { setPubForTests } from '../lib/firebaseAdmin.js';
import {
  maskEmail,
  signInMethodLabel,
  athensDayKey,
  formatAthens,
  countryName,
  cleanHints,
  countryFromRequest,
  signupStats,
  renderSignupEmail,
  sendResendEmail,
  notifySignup,
  sweepMissedSignups,
  setSignupAlertSeamsForTests,
  alertRecipient,
  SIGNUP_ALERT_DEFAULT_TO
} from '../lib/signupAlert.js';
import { safeEqual } from '../lib/auth.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---- fake Firestore (only what signupAlert uses)
function fakePub() {
  const store = new Map();
  const doc = (path) => ({
    async create(data) {
      if (store.has(path)) {
        const e = new Error('6 ALREADY_EXISTS: Document already exists');
        e.code = 6;
        throw e;
      }
      store.set(path, { ...data });
    },
    async set(data, opts) {
      store.set(path, opts?.merge ? { ...(store.get(path) || {}), ...data } : { ...data });
    },
    async delete() {
      store.delete(path);
    },
    async get() {
      return { exists: store.has(path), data: () => store.get(path) };
    }
  });
  return { store, root: { collection: (c) => ({ doc: (id) => doc(`${c}/${id}`) }) } };
}

const NOW = new Date('2026-11-21T10:15:00Z'); // 12:15 Athens
const user = (over = {}) => ({
  uid: 'u1',
  email: 'jadiss@gmail.com',
  displayName: '',
  providerData: [{ providerId: 'password' }],
  metadata: { creationTime: new Date(NOW.getTime() - 60_000).toUTCString() },
  ...over
});

test('maskEmail keeps first letter + domain', () => {
  assert.equal(maskEmail('jadiss@gmail.com'), 'j***@gmail.com');
  assert.equal(maskEmail('a@b.co'), 'a***@b.co');
  assert.equal(maskEmail(''), '');
  assert.equal(maskEmail('nope'), '');
});

test('signInMethodLabel maps Firebase providers', () => {
  assert.equal(signInMethodLabel('password'), 'Email & password');
  assert.equal(signInMethodLabel('google.com'), 'Google');
  assert.equal(signInMethodLabel(''), 'Unknown');
});

test('Athens day key and timestamp use Europe/Athens', () => {
  // 22:30 UTC on 20 Nov = 00:30 on 21 Nov in Athens (UTC+2)
  assert.equal(athensDayKey(new Date('2026-11-20T22:30:00Z')), '2026-11-21');
  assert.match(formatAthens(new Date('2026-11-20T22:30:00Z')), /21 Nov 2026.*00:30 \(Athens time\)/);
});

test('countryName / cleanHints validate input', () => {
  assert.equal(countryName('GR'), 'Greece');
  assert.equal(countryName('XX'), '');
  assert.deepEqual(cleanHints({ exam: 'tef-canada', locale: 'fr-CA', timeZone: 'America/Toronto' }), {
    exam: 'TEF_CANADA',
    locale: 'fr-CA',
    timeZone: 'America/Toronto'
  });
  assert.deepEqual(cleanHints({ exam: '<script>', locale: 'x'.repeat(50), timeZone: '../../etc' }), { exam: null, locale: null, timeZone: null });
  assert.deepEqual(cleanHints(null), { exam: null, locale: null, timeZone: null });
});

test('countryFromRequest trusts the worker header only with the proxy key', () => {
  const prev = process.env.PROXY_SHARED_SECRET;
  process.env.PROXY_SHARED_SECRET = 'k';
  try {
    assert.equal(countryFromRequest({ headers: { 'x-oeh-proxy-key': 'k', 'x-oeh-client-country': 'MA' } }, safeEqual), 'MA');
    assert.equal(countryFromRequest({ headers: { 'x-oeh-proxy-key': 'bad', 'x-oeh-client-country': 'MA', 'x-vercel-ip-country': 'DE' } }, safeEqual), 'DE');
  } finally {
    if (prev === undefined) delete process.env.PROXY_SHARED_SECRET;
    else process.env.PROXY_SHARED_SECRET = prev;
  }
});

test('signupStats counts registered users and today (Athens), skipping anonymous', async () => {
  const pages = [
    {
      users: [
        user({ uid: 'a' }),
        user({ uid: 'b', metadata: { creationTime: new Date('2026-11-20T21:59:00Z').toUTCString() } }), // 23:59 Athens on the 20th
        user({ uid: 'c', metadata: { creationTime: new Date('2026-11-20T22:01:00Z').toUTCString() } }), // 00:01 Athens on the 21st
        { uid: 'anon', providerData: [], metadata: { creationTime: NOW.toUTCString() } }
      ],
      pageToken: 'p2'
    },
    { users: [user({ uid: 'd', metadata: { creationTime: new Date('2026-01-01T00:00:00Z').toUTCString() } })] }
  ];
  let i = 0;
  const r = await signupStats({ now: NOW, listPage: async () => pages[i++] });
  assert.deepEqual(r, { total: 4, today: 2 });
});

test('renderSignupEmail: escaped, branded, masked, plain-text fallback, no placeholders', () => {
  const m = renderSignupEmail({
    displayName: 'Ana <b>',
    maskedEmail: 'a***@gmail.com',
    method: 'Google',
    exam: 'TEF_CANADA',
    country: 'CA',
    locale: 'fr-CA',
    timeZone: 'America/Toronto',
    createdAt: NOW,
    total: 128,
    today: 3
  });
  assert.match(m.subject, /New learner joined: Ana <b> \(learner #128\)/);
  assert.ok(m.html.includes('Ana &lt;b&gt;'));
  assert.ok(!m.html.includes('Ana <b>'));
  assert.ok(m.html.includes('#C2410C') && m.html.includes('#F7F5F0') && m.html.includes('Fraunces'));
  assert.ok(m.html.includes('Your 128th learner just joined'));
  assert.ok(m.html.includes('TEF Canada') || m.html.includes('TEF_CANADA'));
  assert.ok(m.html.includes('Canada'));
  assert.ok(m.html.includes('prefers-color-scheme: dark'));
  assert.ok(!m.html.includes('jadiss@gmail.com'));
  assert.ok(!/undefined|null|NaN/.test(m.html.replace(/data-ogsc/g, '')));
  assert.match(m.text, /Learners total: 128/);
  assert.match(m.text, /Joined today: 3/);
  assert.match(m.text, /Signed up with: Google/);
});

test('renderSignupEmail omits unknown fields instead of inventing them', () => {
  const m = renderSignupEmail({ maskedEmail: 'j***@x.io', method: 'Email & password', createdAt: NOW, total: null, today: null });
  assert.ok(!m.html.includes('Target exam'));
  assert.ok(!m.html.includes('Learners total'));
  assert.equal(m.subject, '🎉 New learner joined: j***@x.io');
  assert.ok(m.html.includes('A new learner just joined'));
});

test('sendResendEmail: skips without key, posts with key, times out cleanly', async () => {
  assert.deepEqual(await sendResendEmail({ apiKey: '', to: 'x@y.z' }), { ok: false, skipped: 'not-configured' });
  let seen;
  const ok = await sendResendEmail({
    apiKey: 'k',
    to: 'x@y.z',
    from: 'OpenExam Hub <notifications@openexamhub.org>',
    subject: 's',
    html: '<p>h</p>',
    text: 't',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
    }
  });
  assert.deepEqual(ok, { ok: true, id: 'em_1' });
  assert.equal(seen.url, 'https://api.resend.com/emails');
  assert.equal(seen.init.headers.Authorization, 'Bearer k');
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.to, ['x@y.z']);
  assert.equal(body.from, 'OpenExam Hub <notifications@openexamhub.org>');
  const slow = await sendResendEmail({
    apiKey: 'k',
    to: 'x',
    timeoutMs: 30,
    fetchImpl: (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))
  });
  assert.deepEqual(slow, { ok: false, error: 'timeout' });
  const bad = await sendResendEmail({ apiKey: 'k', to: 'x', fetchImpl: async () => new Response('{"name":"validation_error"}', { status: 422 }) });
  assert.equal(bad.ok, false);
});

test('alertRecipient defaults to the founder and honours SIGNUP_ALERT_TO', () => {
  const prev = process.env.SIGNUP_ALERT_TO;
  delete process.env.SIGNUP_ALERT_TO;
  assert.equal(alertRecipient(), SIGNUP_ALERT_DEFAULT_TO);
  process.env.SIGNUP_ALERT_TO = 'other@example.com';
  assert.equal(alertRecipient(), 'other@example.com');
  if (prev === undefined) delete process.env.SIGNUP_ALERT_TO;
  else process.env.SIGNUP_ALERT_TO = prev;
});

test('notifySignup: sends once, dedupes, rejects old/anonymous, releases claim on failure', async () => {
  const fs = fakePub();
  setPubForTests(() => fs.root);
  const sent = [];
  let fail = false;
  setSignupAlertSeamsForTests({
    stats: async () => ({ total: 42, today: 2 }),
    send: async (msg) => {
      if (fail) return { ok: false, error: 'resend 500' };
      sent.push(msg);
      return { ok: true, id: `em_${sent.length}` };
    }
  });
  const prevKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-key';
  try {
    const decoded = { firebase: { sign_in_provider: 'google.com' } };
    assert.equal((await notifySignup({ userRecord: user(), decoded, hints: { exam: 'IELTS' }, country: 'GR', now: NOW })).status, 'sent');
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /learner #42/);
    assert.ok(sent[0].html.includes('j***@gmail.com'));
    assert.ok(sent[0].html.includes('Google'));
    assert.ok(sent[0].html.includes('Greece'));
    assert.equal(fs.store.get('signup_alerts/u1').emailId, 'em_1');
    assert.equal(fs.store.get('stats/users').registeredUsers, 42);

    assert.equal((await notifySignup({ userRecord: user(), decoded, now: NOW })).status, 'duplicate');
    assert.equal(sent.length, 1);

    const old = user({ uid: 'old', metadata: { creationTime: new Date(NOW.getTime() - 3 * 864e5).toUTCString() } });
    assert.equal((await notifySignup({ userRecord: old, now: NOW })).status, 'not-new');
    assert.equal((await notifySignup({ userRecord: { uid: 'anon', providerData: [] }, now: NOW })).status, 'anonymous');

    fail = true;
    assert.equal((await notifySignup({ userRecord: user({ uid: 'u2' }), now: NOW })).status, 'failed');
    assert.equal(fs.store.has('signup_alerts/u2'), false, 'claim released so a retry can deliver');
    fail = false;
    assert.equal((await notifySignup({ userRecord: user({ uid: 'u2' }), now: NOW })).status, 'sent');

    delete process.env.RESEND_API_KEY;
    assert.equal((await notifySignup({ userRecord: user({ uid: 'u3' }), now: NOW })).status, 'not-configured');
    assert.equal(fs.store.has('signup_alerts/u3'), false);
    process.env.RESEND_API_KEY = 'test-key';

    // Sweep: picks up u3 (missed), skips already-alerted u1/u2, ignores old and anonymous users.
    const page = { users: [user(), user({ uid: 'u2' }), user({ uid: 'u3' }), old, { uid: 'anon', providerData: [], metadata: { creationTime: NOW.toUTCString() } }] };
    const r = await sweepMissedSignups({ now: NOW, listPage: async () => page });
    assert.deepEqual({ candidates: r.candidates, sent: r.sent }, { candidates: 1, sent: 1 });
    assert.match(sent[sent.length - 1].html, /nightly check/);
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    setSignupAlertSeamsForTests({});
    setPubForTests(null);
  }
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ok   ${t.name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${t.name}\n${err?.stack || err}`);
  }
}

if (process.env.SIGNUP_PREVIEW_OUT) {
  // Illustrative sample for design review only (not real user data).
  const m = renderSignupEmail({
    displayName: 'Sample Learner',
    maskedEmail: 's***@gmail.com',
    method: 'Google',
    exam: 'TEF_CANADA',
    country: 'CA',
    locale: 'fr-CA',
    timeZone: 'America/Toronto',
    createdAt: new Date(),
    total: 128,
    today: 3
  });
  writeFileSync(process.env.SIGNUP_PREVIEW_OUT, m.html);
  writeFileSync(process.env.SIGNUP_PREVIEW_OUT.replace(/\.html$/, '.txt'), `Subject: ${m.subject}\n\n${m.text}\n`);
  console.log(`  preview -> ${process.env.SIGNUP_PREVIEW_OUT}`);
}

console.log(`\n${tests.length - failed}/${tests.length} signup-alert tests passed`);
if (failed) process.exit(1);
