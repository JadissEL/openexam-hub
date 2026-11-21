// Unit tests for the cookieless visit counter (lib/analytics/hits.js) and the admin summary.
import assert from 'node:assert/strict';
import { sanitizeBeacon, validRecord, incrementsFor, refHost, normPath, inAppName, isBotUserAgent, athensDay } from '../lib/analytics/hits.js';
import { summarise, asText } from '../lib/routes/admin/analytics.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const LI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]';
let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok   ${name}`); };

test('bots and tools are dropped', () => {
  for (const ua of ['curl/8.14.1', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/159.0', 'python-httpx/0.28', '', 'Mozilla/5.0', 'Mozilla/5.0 (compatible; GSC-audit/1.0)']) {
    assert.equal(isBotUserAgent(ua), true, ua);
    assert.equal(sanitizeBeacon({ t: 'view', p: '/' }, ua), null);
  }
  assert.equal(isBotUserAgent(CHROME), false);
});

test('view beacon keeps only path, referrer host, utm_source and in-app name', () => {
  const r = sanitizeBeacon({ t: 'view', p: '/exams/ielts?x=1#y', r: 'https://t.co/abc', u: 'Reddit', ip: '1.2.3.4', extra: 'x' }, LI);
  assert.deepEqual(r, { t: 'view', p: '/exams/ielts', r: 'x.com', u: 'reddit', a: 'linkedin' });
  assert.deepEqual(sanitizeBeacon({ t: 'view', p: '/', r: '' }, CHROME), { t: 'view', p: '/', r: '(direct)', u: null, a: null });
  assert.equal(sanitizeBeacon({ t: 'view', p: '/faq', r: 'https://openexamhub.org/' }, CHROME).r, null);
});

test('paths and referrers are normalised and bounded', () => {
  assert.equal(normPath('/blog/tef-canada-clb-nclc-express-entry/'), '/blog/tef-canada-clb-nclc-express-entry');
  assert.equal(normPath('/.env'), '(other)');
  assert.equal(normPath('/wp-admin/x/y/z'), '(other)');
  assert.equal(refHost('https://old.reddit.com/r/IELTS'), 'reddit.com');
  assert.equal(refHost('https://l.facebook.com/l.php?u=x'), 'facebook.com');
  assert.equal(refHost('https://www.google.gr/'), 'google');
  assert.equal(refHost('android-app://com.linkedin.android/'), 'linkedin.com');
  assert.equal(refHost('not a url'), '(other)');
  assert.equal(inAppName('Mozilla/5.0 (Linux; Android 14; wv) [FBAN/FB4A;FBAV/1]'), 'facebook');
  assert.equal(inAppName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Gmail/6.0.241031'), 'gmail');
  assert.equal(inAppName('Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Gmail/2024.10.27'), 'gmail');
  assert.equal(inAppName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/323.0 Mobile/15E148 Safari/604.1'), 'gmail');
});

test('events: only the three funnel events', () => {
  assert.deepEqual(sanitizeBeacon({ t: 'event', e: 'signup_started' }, CHROME), { t: 'event', e: 'signup_started', a: null });
  assert.equal(sanitizeBeacon({ t: 'event', e: 'anything' }, CHROME), null);
  assert.equal(validRecord({ t: 'event', e: 'nope' }), null);
});

test('increments: entries only for views that did not come from our own pages', () => {
  const inc = (k) => ({ inc: k });
  const own = incrementsFor(validRecord({ t: 'view', p: '/faq', r: null }), inc);
  assert.equal(own.entries, undefined);
  const ext = incrementsFor(validRecord({ t: 'view', p: '/', r: 'x.com', u: 'x', a: 'linkedin' }), inc);
  assert.deepEqual(Object.keys(ext).sort(), ['entries', 'entryPaths', 'inApp', 'paths', 'refs', 'utm', 'views']);
  assert.ok(!JSON.stringify(ext).includes('1.2.3.4'));
});

test('summary and text report', () => {
  const s = summarise([{ day: '2026-11-21', views: 3, entries: 2, refs: { 'x.com': 2 }, paths: { '/': 3 }, events: { preview_opened: 1 } }, { day: '2026-11-22' }]);
  assert.equal(s.totals.views, 3);
  assert.equal(s.byDay[1].views, 0);
  assert.deepEqual(s.top.referrers[0], ['x.com', 2]);
  assert.match(asText(s, 2), /2026-11-21\s+3\s+2\s+1/);
  assert.match(athensDay(new Date('2026-11-20T22:30:00Z')), /^2026-11-21$/);
});

// Worker: /api/hit forwards only the stripped record, signed, and never the IP or user agent.
const worker = (await import('../worker/index.js')).default;
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 204 }); };
const env = { API_ORIGIN: 'https://api.example', PROXY_SHARED_SECRET: 'k', ASSETS: { fetch: async () => new Response('x') } };
const mk = (ua, body, extra = {}) => new Request('https://openexamhub.org/api/hit', { method: 'POST', headers: { 'user-agent': ua, origin: 'https://openexamhub.org', 'cf-connecting-ip': '9.9.9.9', ...extra }, body: JSON.stringify(body) });
let res = await worker.fetch(mk(LI, { t: 'view', p: '/', r: 'https://www.reddit.com/r/IELTS', u: 'reddit' }), env, null);
assert.equal(res.status, 204);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://api.example/api/hit');
assert.equal(calls[0].init.headers['x-oeh-proxy-key'], 'k');
assert.deepEqual(JSON.parse(calls[0].init.body), { t: 'view', p: '/', r: 'reddit.com', u: 'reddit', a: 'linkedin' });
assert.ok(!calls[0].init.body.includes('9.9.9.9') && !JSON.stringify(calls[0].init.headers).includes('9.9.9.9'));
res = await worker.fetch(mk('curl/8.14.1', { t: 'view', p: '/' }), env, null);
assert.equal(res.status, 204);
res = await worker.fetch(mk(CHROME, { t: 'view', p: '/' }, { origin: 'https://evil.example' }), env, null);
assert.equal(calls.length, 1, 'bots and foreign origins are not forwarded');
n++; console.log('  ok   worker strips, signs and filters /api/hit');

console.log(`${n} hit-counter tests passed`);
