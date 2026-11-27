// Offline tests for learner account emails (lib/userEmails.js): templates, rate limits, routing
// between verify/welcome, fallback when Resend is missing or fails. No network, no Firebase project.
// Run: node scripts/test-user-emails.mjs   (USER_EMAIL_PREVIEW_DIR=/dir also writes sample HTML)
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { setPubForTests } from '../lib/firebaseAdmin.js';
import {
  renderVerifyEmail,
  renderWelcomeEmail,
  checkVerifyRate,
  emailLang,
  sendVerificationEmail,
  sendWelcomeEmail,
  handleSignupUserEmail,
  setUserEmailSeamsForTests,
  VERIFY_COOLDOWN_MS,
  VERIFY_DAILY_MAX,
  USER_EMAIL_DEFAULT_FROM
} from '../lib/userEmails.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function fakeStore() {
  const store = new Map();
  const ref = (path) => ({
    path,
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
  const root = { collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }) };
  const transaction = async (fn) => {
    const writes = [];
    const tx = { get: (r) => r.get(), set: (r, d, o) => writes.push(() => r.set(d, o)) };
    const out = await fn(tx);
    for (const w of writes) await w();
    return out;
  };
  return { store, root, transaction };
}

const NOW = Date.parse('2026-11-21T10:00:00Z');
const pwUser = (over = {}) => ({
  uid: 'p1',
  email: 'learner@gmail.com',
  emailVerified: false,
  displayName: '',
  providerData: [{ providerId: 'password' }],
  metadata: { creationTime: new Date(NOW - 60_000).toUTCString() },
  ...over
});
const googleUser = (over = {}) => ({
  ...pwUser({ uid: 'g1', email: 'ana@gmail.com', emailVerified: true, displayName: 'Ana Silva', providerData: [{ providerId: 'google.com' }] }),
  ...over
});

test('emailLang picks FR for fr-* locales only', () => {
  assert.equal(emailLang('fr-CA'), 'fr');
  assert.equal(emailLang('fr'), 'fr');
  assert.equal(emailLang('en-US'), 'en');
  assert.equal(emailLang(undefined), 'en');
});

test('verify template: link in button + text, escaped email, EN/FR', () => {
  const href = 'https://openexam-hub.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=abc&continueUrl=https%3A%2F%2Fopenexamhub.org%2Fapp';
  const en = renderVerifyEmail({ link: href, email: 'a<b>@x.io', lang: 'en' });
  assert.equal(en.subject, 'Verify your email for OpenExam Hub');
  assert.ok(en.html.includes('a&lt;b&gt;@x.io') && !en.html.includes('a<b>@x.io'));
  assert.ok(en.html.includes(href.replace(/&/g, '&amp;')));
  assert.ok(en.text.includes(href));
  assert.ok(en.html.includes('#C2410C') && en.html.includes('Fraunces') && en.html.includes('prefers-color-scheme: dark'));
  const fr = renderVerifyEmail({ link: href, email: 'x@y.fr', lang: 'fr' });
  assert.match(fr.subject, /Confirmez/);
  assert.ok(fr.html.includes('lang="fr"'));
  assert.ok(fr.html.includes('Confirmer mon e-mail'));
});

test('welcome template: first name, exam deep link, GitHub, transactional footer, no placeholders', () => {
  const m = renderWelcomeEmail({ displayName: 'Ana Silva', exam: 'TEF_CANADA', lang: 'en' });
  assert.ok(m.html.includes('Hi Ana,'));
  assert.ok(m.html.includes('https://openexamhub.org/app?exam=TEF_CANADA'));
  assert.ok(m.html.includes('github.com/JadissEL/openexam-hub'));
  assert.ok(/not marketing/.test(m.html));
  assert.ok(!/undefined|null|NaN/.test(m.html.replace(/data-ogsc/g, '')));
  const bare = renderWelcomeEmail({ lang: 'fr' });
  assert.ok(bare.html.includes('https://openexamhub.org/app"'));
  assert.ok(bare.html.includes('Merci de rejoindre OpenExam Hub.'));
});

test('demo block: linked thumbnail with alt text in welcome + verify, link in plain text, EN/FR', () => {
  const thumb = 'https://openexamhub.org/email/demo-thumb.jpg';
  const yt = 'https://www.youtube.com/watch?v=zpovLKLru6Y';
  for (const m of [renderWelcomeEmail({ lang: 'en' }), renderVerifyEmail({ link: 'https://l', email: 'a@b.c', lang: 'en' })]) {
    assert.ok(m.html.includes(`src="${thumb}"`));
    assert.ok(m.html.includes(`href="${yt}"`));
    assert.match(m.html, /alt="Play the OpenExam Hub demo video \(1:15\) on YouTube"/);
    assert.ok(m.text.includes(yt));
  }
  const fr = renderWelcomeEmail({ lang: 'fr' });
  assert.ok(fr.html.includes('Voir comment ça marche'));
  assert.ok(fr.text.includes(`Regarder la démo sur YouTube: ${yt}`));
});

test('checkVerifyRate: 60s cooldown and 5 per 24h', () => {
  assert.equal(checkVerifyRate([], NOW).ok, true);
  const c = checkVerifyRate([NOW - 10_000], NOW);
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'cooldown');
  assert.equal(c.retryAfterSec, 50);
  assert.equal(checkVerifyRate([NOW - VERIFY_COOLDOWN_MS], NOW).ok, true);
  const five = Array.from({ length: VERIFY_DAILY_MAX }, (_, i) => NOW - (i + 1) * 3600_000);
  const d = checkVerifyRate(five, NOW);
  assert.equal(d.ok, false);
  assert.equal(d.reason, 'daily');
  assert.equal(checkVerifyRate(five.map((t) => t - 864e5), NOW).ok, true, 'old sends expire');
});

async function withEnv(key, fn) {
  const prev = process.env.RESEND_API_KEY;
  if (key === null) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = key;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  }
}

test('verification: sends via Resend from hello@, dedupes signup, rate limits resends', async () => {
  const fs = fakeStore();
  setPubForTests(() => fs.root);
  const sent = [];
  setUserEmailSeamsForTests({
    transaction: fs.transaction,
    generateLink: async (email) => `https://openexam-hub.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=x&email=${encodeURIComponent(email)}`,
    send: async (m) => (sent.push(m), { ok: true, id: 'e' })
  });
  try {
    await withEnv('k', async () => {
      const r = await handleSignupUserEmail({ userRecord: pwUser(), hints: { locale: 'fr-FR' }, now: NOW });
      assert.deepEqual(r, { kind: 'verify', status: 'sent' });
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, 'learner@gmail.com');
      assert.equal(sent[0].from, USER_EMAIL_DEFAULT_FROM);
      assert.equal(sent[0].replyTo, 'hello@openexamhub.org');
      assert.match(sent[0].subject, /Confirmez/);
      assert.ok(sent[0].html.includes('oobCode=x'));
      assert.equal((await handleSignupUserEmail({ userRecord: pwUser(), now: NOW + 120_000 })).status, 'duplicate');
      assert.equal((await sendVerificationEmail({ userRecord: pwUser(), now: NOW + 5_000 })).status, 'rate-limited');
      let t = NOW;
      for (let i = 0; i < VERIFY_DAILY_MAX - 1; i++) {
        t += VERIFY_COOLDOWN_MS;
        assert.equal((await sendVerificationEmail({ userRecord: pwUser(), now: t })).status, 'sent', `send ${i}`);
      }
      const capped = await sendVerificationEmail({ userRecord: pwUser(), now: t + VERIFY_COOLDOWN_MS });
      assert.equal(capped.status, 'rate-limited');
      assert.equal(capped.reason, 'daily');
      assert.equal(sent.length, VERIFY_DAILY_MAX);
      assert.equal((await sendVerificationEmail({ userRecord: pwUser({ emailVerified: true }), now: t })).status, 'already-verified');
      assert.equal((await sendVerificationEmail({ userRecord: googleUser({ emailVerified: false }), now: t })).status, 'not-password');
    });
  } finally {
    setUserEmailSeamsForTests({});
    setPubForTests(null);
  }
});

test('verification falls back to the client when Resend is missing or fails (slot still counted)', async () => {
  const fs = fakeStore();
  setPubForTests(() => fs.root);
  setUserEmailSeamsForTests({ transaction: fs.transaction, generateLink: async () => 'https://l', send: async () => ({ ok: false, error: 'resend 500' }) });
  try {
    await withEnv(null, async () => {
      assert.deepEqual(await handleSignupUserEmail({ userRecord: pwUser(), now: NOW }), { kind: 'verify', status: 'fallback' });
      assert.equal(fs.store.get('user_emails/p1').verifySends.length, 1);
    });
    await withEnv('k', async () => {
      assert.equal((await sendVerificationEmail({ userRecord: pwUser(), now: NOW + VERIFY_COOLDOWN_MS })).status, 'fallback');
    });
  } finally {
    setUserEmailSeamsForTests({});
    setPubForTests(null);
  }
});

test('welcome: Google accounts get one welcome; missing key skips; old accounts get nothing', async () => {
  const fs = fakeStore();
  setPubForTests(() => fs.root);
  const sent = [];
  let fail = false;
  setUserEmailSeamsForTests({ transaction: fs.transaction, send: async (m) => (fail ? { ok: false } : (sent.push(m), { ok: true })) });
  try {
    await withEnv(null, async () => {
      assert.deepEqual(await handleSignupUserEmail({ userRecord: googleUser(), now: NOW }), { kind: 'welcome', status: 'not-configured' });
    });
    await withEnv('k', async () => {
      fail = true;
      assert.equal((await sendWelcomeEmail({ userRecord: googleUser(), now: NOW })).status, 'failed');
      fail = false;
      const r = await handleSignupUserEmail({ userRecord: googleUser(), hints: { exam: 'IELTS' }, now: NOW });
      assert.deepEqual(r, { kind: 'welcome', status: 'sent' });
      assert.equal(sent.length, 1);
      assert.match(sent[0].subject, /Welcome to OpenExam Hub/);
      assert.ok(sent[0].html.includes('Hi Ana,'));
      assert.ok(sent[0].html.includes('IELTS'));
      assert.equal((await handleSignupUserEmail({ userRecord: googleUser(), now: NOW })).status, 'duplicate');
      const old = googleUser({ uid: 'g2', metadata: { creationTime: new Date(NOW - 3 * 864e5).toUTCString() } });
      assert.deepEqual(await handleSignupUserEmail({ userRecord: old, now: NOW }), { kind: null, status: 'not-new' });
      assert.equal(sent.length, 1);
    });
  } finally {
    setUserEmailSeamsForTests({});
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

const dir = process.env.USER_EMAIL_PREVIEW_DIR;
if (dir) {
  // Illustrative samples for design review only (not real user data).
  const sampleLink = 'https://openexam-hub.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=SAMPLE&continueUrl=https%3A%2F%2Fopenexamhub.org%2Fapp&lang=en';
  const out = {
    'verify.html': renderVerifyEmail({ link: sampleLink, email: 'learner@gmail.com', lang: 'en' }),
    'verify-fr.html': renderVerifyEmail({ link: sampleLink, email: 'learner@gmail.com', lang: 'fr' }),
    'welcome.html': renderWelcomeEmail({ displayName: 'Sample Learner', exam: 'TEF_CANADA', lang: 'en' }),
    'welcome-fr.html': renderWelcomeEmail({ displayName: 'Sample Learner', exam: 'TEF_CANADA', lang: 'fr' })
  };
  for (const [f, m] of Object.entries(out)) {
    writeFileSync(`${dir}/${f}`, m.html);
    writeFileSync(`${dir}/${f.replace(/\.html$/, '.txt')}`, `Subject: ${m.subject}\n\n${m.text}\n`);
  }
  console.log(`  previews -> ${dir}`);
}

console.log(`\n${tests.length - failed}/${tests.length} user-email tests passed`);
if (failed) process.exit(1);
