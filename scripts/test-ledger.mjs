// Offline tests for donation ingestion + link maintenance. No network, no real Firestore.
// Run: node scripts/test-ledger.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { setStoreForTests } from '../lib/store.js';
import { setClockForTests, setOcFetchForTests } from '../lib/ledger.js';
import { setLinkCheckerForTests, recheckLinks } from '../lib/agents/linkMaintenance.js';
import ghHandler from '../lib/routes/webhooks/github-sponsors.js';
import kofiHandler from '../lib/routes/webhooks/kofi.js';
import ocHandler from '../lib/routes/webhooks/open-collective.js';
import cronHandler from '../lib/routes/cron/recheck-links.js';
import webhookDispatcher from '../api/webhooks/[provider].js';
import cronDispatcher from '../api/cron/[job].js';
import adminDispatcher from '../api/admin/[action].js';
import publicDispatcher from '../api/[route].js';

// ------------------------------------------------------------ in-memory Firestore fake
class FakeFirestore {
  constructor() {
    this.docs = new Map(); // path -> data
  }
  doc(path) {
    return new DocRef(this, path);
  }
  collection(path) {
    return new ColRef(this, path);
  }
  async runTransaction(fn) {
    const writes = [];
    const tx = {
      get: async (ref) => ref.get(),
      set: (ref, data, opts) => writes.push(() => ref._set(data, opts)),
      update: (ref, data) => writes.push(() => ref._update(data)),
      delete: (ref) => writes.push(() => this.docs.delete(ref.path)),
      create: (ref, data) =>
        writes.push(() => {
          if (this.docs.has(ref.path)) {
            const e = new Error('6 ALREADY_EXISTS: Document already exists');
            e.code = 6;
            throw e;
          }
          ref._set(data);
        })
    };
    const result = await fn(tx);
    // atomic commit: verify creates first, then apply everything
    const snapshot = new Map(this.docs);
    try {
      for (const w of writes) w();
    } catch (e) {
      this.docs = snapshot;
      throw e;
    }
    return result;
  }
}
const clone = (v) => (v === undefined ? v : structuredClone(v));
class Snap {
  constructor(id, data) {
    this.id = id;
    this._d = data;
    this.exists = data !== undefined;
  }
  data() {
    return clone(this._d);
  }
}
class DocRef {
  constructor(fs, path) {
    this.fs = fs;
    this.path = path;
    this.id = path.split('/').pop();
  }
  collection(name) {
    return new ColRef(this.fs, `${this.path}/${name}`);
  }
  async get() {
    return new Snap(this.id, clone(this.fs.docs.get(this.path)));
  }
  _set(data, opts) {
    const prev = opts?.merge ? this.fs.docs.get(this.path) || {} : {};
    this.fs.docs.set(this.path, { ...clone(prev), ...clone(data) });
  }
  _update(data) {
    if (!this.fs.docs.has(this.path)) {
      const e = new Error('5 NOT_FOUND');
      e.code = 5;
      throw e;
    }
    this._set(data, { merge: true });
  }
  async set(data, opts) {
    this._set(data, opts);
  }
  async update(data) {
    this._update(data);
  }
  async create(data) {
    if (this.fs.docs.has(this.path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    this._set(data);
  }
  async delete() {
    this.fs.docs.delete(this.path);
  }
}
const ms = (v) => (v instanceof Date ? v.getTime() : v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : -Infinity);
class ColRef {
  constructor(fs, path, q = {}) {
    this.fs = fs;
    this.path = path;
    this.q = q;
  }
  doc(id) {
    return new DocRef(this.fs, `${this.path}/${id}`);
  }
  orderBy(field, dir = 'asc') {
    return new ColRef(this.fs, this.path, { ...this.q, orderBy: [field, dir] });
  }
  limit(n) {
    return new ColRef(this.fs, this.path, { ...this.q, limit: n });
  }
  select() {
    return this;
  }
  where(f, op, v) {
    return new ColRef(this.fs, this.path, { ...this.q, where: [...(this.q.where || []), [f, op, v]] });
  }
  async get() {
    const prefix = `${this.path}/`;
    const match = ([f, op, v], d) =>
      op === '==' ? d[f] === v
        : op === 'in' ? v.includes(d[f])
        : op === 'array-contains' ? Array.isArray(d[f]) && d[f].includes(v)
        : op === 'array-contains-any' ? Array.isArray(d[f]) && d[f].some((x) => v.includes(x))
        : op === '<=' ? d[f] !== undefined && ms(d[f]) <= ms(v)
        : false;
    let docs = [...this.fs.docs.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .filter(([, d]) => (this.q.where || []).every((w) => match(w, d)))
      .map(([p, d]) => Object.assign(new Snap(p.slice(prefix.length), clone(d)), { ref: new DocRef(this.fs, p) }));
    if (this.q.orderBy) {
      const [f, dir] = this.q.orderBy;
      docs = docs.filter((s) => s._d[f] !== undefined); // Firestore omits docs missing the order field
      docs.sort((a, b) => (ms(a._d[f]) - ms(b._d[f])) * (dir === 'desc' ? -1 : 1));
    }
    if (this.q.limit) docs = docs.slice(0, this.q.limit);
    return { docs, empty: !docs.length, size: docs.length };
  }
}

let fs;
const PUB = 'artifacts/test-app/public/data';
function reset() {
  fs = new FakeFirestore();
  setStoreForTests({ db: fs, pub: () => fs.doc(PUB) });
}
const ledger = () => fs.docs.get(`${PUB}/treasury/monthly_ledger`);
const eventDocs = () => [...fs.docs.entries()].filter(([p]) => p.startsWith(`${PUB}/ledger_events/`));

// ------------------------------------------------------------ fake req/res
function mkReq({ method = 'POST', url = '/', headers = {}, body = '', query }) {
  const req = Readable.from([Buffer.from(body)]);
  req.method = method;
  req.url = url;
  if (query) req.query = query;
  req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return req;
}
function mkRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.status = (c) => ((res.statusCode = c), res);
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.end = (b = '') => (res.body = b);
  res.json = () => JSON.parse(res.body);
  return res;
}
async function call(handler, reqOpts) {
  const res = mkRes();
  await handler(mkReq(reqOpts), res);
  return { status: res.statusCode, json: res.body ? res.json() : null };
}

// ------------------------------------------------------------ env + fixtures
process.env.GITHUB_SPONSORS_WEBHOOK_SECRET = 'gh-test-secret';
process.env.KOFI_VERIFICATION_TOKEN = 'kofi-test-token-1234';
process.env.OPEN_COLLECTIVE_WEBHOOK_TOKEN = 'oc-test-token-abcdef';
process.env.OPEN_COLLECTIVE_SLUG = 'openexam-hub';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.FX_USD_EUR = '0.9';
process.env.FX_GBP_EUR = '1.15';
delete process.env.FX_JPY_EUR;

const tier = (cents, name = `$${cents / 100} a month`) => ({ monthly_price_in_cents: cents, monthly_price_in_dollars: cents / 100, name, is_one_time: false, is_custom_amount: false });
const sponsorship = (action, cents, extra = {}) => ({
  action,
  sponsorship: { privacy_level: 'public', sponsor: { login: 'monalisa' }, tier: tier(cents), ...extra.sp },
  ...extra.top
});
const sign = (body, secret = process.env.GITHUB_SPONSORS_WEBHOOK_SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
const gh = (payload, { delivery, signature } = {}) => {
  const body = JSON.stringify(payload);
  return call(ghHandler, {
    headers: { 'content-type': 'application/json', 'x-github-event': 'sponsorship', 'x-github-delivery': delivery, 'x-hub-signature-256': signature ?? sign(body) },
    body
  });
};
const kofi = (data) => call(kofiHandler, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: JSON.stringify(data) }).toString() });
const kofiPayload = (over = {}) => ({
  verification_token: process.env.KOFI_VERIFICATION_TOKEN,
  message_id: 'a1b2c3d4-0000-4000-8000-000000000001',
  timestamp: '2026-11-20T10:00:00Z',
  type: 'Donation',
  is_public: true,
  from_name: 'Jo Example',
  message: 'Good luck with the TCF!',
  amount: '5.00',
  currency: 'EUR',
  email: 'jo@example.com',
  kofi_transaction_id: 'tx-1',
  ...over
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ------------------------------------------------------------ tests
test('GitHub: valid signature is accepted and adds tier price as MRR', async () => {
  reset();
  setClockForTests(() => new Date('2026-11-20T10:00:00Z'));
  const r = await gh(sponsorship('created', 1000), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0001' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.counted, true);
  assert.equal(ledger().githubSponsors, 9); // $10 * 0.9
  assert.equal(ledger().month, '2026-11');
  const [, ev] = eventDocs()[0];
  assert.equal(ev.contributor, '@monalisa');
  assert.equal(ev.amountEur, 9);
  assert.equal(ev.currency, 'USD');
});

test('GitHub: invalid / missing signature -> 401, nothing written', async () => {
  reset();
  const bad = await gh(sponsorship('created', 1000), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0002', signature: sign('{"tampered":1}') });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error, 'invalid signature');
  const wrongSecret = await gh(sponsorship('created', 1000), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0003', signature: sign(JSON.stringify(sponsorship('created', 1000)), 'other') });
  assert.equal(wrongSecret.status, 401);
  const none = await gh(sponsorship('created', 1000), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0004', signature: '' });
  assert.equal(none.status, 401);
  assert.equal(ledger(), undefined);
  assert.equal(eventDocs().length, 0);
});

test('GitHub: duplicate delivery is a 200 no-op', async () => {
  reset();
  const d = '72d3162e-cc78-11e3-81ab-4c9367dc0005';
  const a = await gh(sponsorship('created', 500), { delivery: d });
  const b = await gh(sponsorship('created', 500), { delivery: d });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(b.json.duplicate, true);
  assert.equal(ledger().githubSponsors, 4.5);
  assert.equal(eventDocs().length, 1);
  // concurrent duplicates: both pass the read, one create() loses at commit
  const c = '72d3162e-cc78-11e3-81ab-4c9367dc0006';
  const [x, y] = await Promise.all([gh(sponsorship('created', 500), { delivery: c }), gh(sponsorship('created', 500), { delivery: c })]);
  assert.deepEqual([x.status, y.status], [200, 200]);
  assert.equal([x.json.duplicate, y.json.duplicate].filter(Boolean).length, 1);
  assert.equal(ledger().githubSponsors, 9);
});

test('GitHub: tier_changed adjusts by the difference; cancelled subtracts; pending_* no-op; private anonymised', async () => {
  reset();
  await gh(sponsorship('created', 500), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0010' });
  assert.equal(ledger().githubSponsors, 4.5);
  const up = await gh(sponsorship('tier_changed', 2500, { top: { changes: { tier: { from: tier(500) } } } }), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0011' });
  assert.equal(up.status, 200);
  assert.equal(up.json.amountEur, 18); // (+$25 - $5) * 0.9
  assert.equal(ledger().githubSponsors, 22.5);
  const down = await gh(sponsorship('tier_changed', 1000, { top: { changes: { tier: { from: tier(2500) } } } }), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0012' });
  assert.equal(down.json.amountEur, -13.5);
  assert.equal(ledger().githubSponsors, 9);
  const pending = await gh(sponsorship('pending_cancellation', 1000, { top: { effective_date: '2026-12-01T00:00:00Z' } }), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0013' });
  assert.equal(pending.status, 200);
  assert.ok(pending.json.ignored);
  assert.equal(ledger().githubSponsors, 9);
  const priv = await gh(sponsorship('created', 300, { sp: { privacy_level: 'private' } }), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0014' });
  assert.equal(priv.status, 200);
  const privEv = fs.docs.get(`${PUB}/ledger_events/github-72d3162e-cc78-11e3-81ab-4c9367dc0014`);
  assert.equal(privEv.contributor, 'Anonymous sponsor');
  assert.ok(!JSON.stringify(privEv).includes('monalisa'));
  const cancel = await gh(sponsorship('cancelled', 1000), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0015' });
  assert.equal(cancel.status, 200);
  assert.equal(ledger().githubSponsors, 2.7); // 9 + 2.7 - 9
});

test('Ko-fi: wrong verification token -> 401; malformed body -> 400', async () => {
  reset();
  const r = await kofi(kofiPayload({ verification_token: 'nope' }));
  assert.equal(r.status, 401);
  const missing = await kofi({ ...kofiPayload(), verification_token: undefined });
  assert.equal(missing.status, 401);
  const bad = await call(kofiHandler, { body: 'data=%7Bnot-json' });
  assert.equal(bad.status, 400);
  assert.equal(eventDocs().length, 0);
});

test('Ko-fi: private donation hides name and message; shop orders ignored; duplicate message_id no-op', async () => {
  reset();
  const r = await kofi(kofiPayload({ is_public: false, message_id: 'a1b2c3d4-0000-4000-8000-000000000002' }));
  assert.equal(r.status, 200);
  const [, ev] = eventDocs()[0];
  assert.equal(ev.contributor, 'Anonymous supporter');
  assert.equal(ev.note, '');
  assert.ok(!JSON.stringify(ev).includes('Jo Example'));
  assert.ok(!JSON.stringify(ev).includes('jo@example.com'));
  assert.equal(ledger().koFiTips, 5);
  const shop = await kofi(kofiPayload({ type: 'Shop Order', message_id: 'a1b2c3d4-0000-4000-8000-000000000003' }));
  assert.equal(shop.status, 200);
  assert.ok(shop.json.ignored);
  const dup = await kofi(kofiPayload({ is_public: false, message_id: 'a1b2c3d4-0000-4000-8000-000000000002' }));
  assert.equal(dup.json.duplicate, true);
  assert.equal(ledger().koFiTips, 5);
  const sub = await kofi(kofiPayload({ type: 'Subscription', amount: '4.00', currency: 'GBP', message_id: 'a1b2c3d4-0000-4000-8000-000000000004' }));
  assert.equal(sub.json.amountEur, 4.6);
  assert.equal(ledger().koFiTips, 9.6);
});

test('Month rollover archives the previous month, resets tips/OC, keeps GitHub MRR', async () => {
  reset();
  setClockForTests(() => new Date('2026-11-29T23:00:00Z'));
  await gh(sponsorship('created', 1000), { delivery: '72d3162e-cc78-11e3-81ab-4c9367dc0020' });
  await kofi(kofiPayload({ message_id: 'a1b2c3d4-0000-4000-8000-000000000020', amount: '7.50' }));
  fs.docs.set(`${PUB}/treasury/monthly_ledger`, { ...ledger(), adsenseBridge: 38.5, openCollective: 12 });
  setClockForTests(() => new Date('2026-12-01T00:05:00Z'));
  await kofi(kofiPayload({ message_id: 'a1b2c3d4-0000-4000-8000-000000000021', amount: '3.00' }));
  const archive = fs.docs.get(`${PUB}/treasury/2026-11`);
  assert.ok(archive, 'previous month archived');
  assert.equal(archive.koFiTips, 7.5);
  assert.equal(archive.openCollective, 12);
  assert.equal(archive.githubSponsors, 9);
  const l = ledger();
  assert.equal(l.month, '2026-12');
  assert.equal(l.githubSponsors, 9); // MRR carries over
  assert.equal(l.koFiTips, 3); // reset then +3
  assert.equal(l.openCollective, 0);
  assert.equal(l.adsenseBridge, 38.5); // left as is
  assert.equal(l.communityTotalEur, 12);
  // the cron's rollover is a no-op within the same month
  const res = await call(cronHandler, { method: 'GET', headers: { authorization: 'Bearer cron-test-secret' } });
  assert.equal(res.status, 200);
  assert.equal(res.json.ledger.rolledOver, false);
  setClockForTests(() => new Date('2026-11-20T10:00:00Z'));
});

test('Missing FX rate: event recorded, excluded from EUR total, flagged', async () => {
  reset();
  const r = await kofi(kofiPayload({ currency: 'JPY', amount: '800', message_id: 'a1b2c3d4-0000-4000-8000-000000000030' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.counted, false);
  assert.deepEqual(r.json.flags, ['missing_fx_rate']);
  const [, ev] = eventDocs()[0];
  assert.equal(ev.amountEur, null);
  assert.equal(ev.amountOriginal, 800);
  assert.equal(ev.countedInTotal, false);
  assert.equal(ledger().koFiTips, 0);
  assert.equal(ledger().pendingFxEvents, 1);
});

test('Open Collective: bad URL token -> 401; payload re-confirmed via GraphQL (API amount wins)', async () => {
  reset();
  const payload = { type: 'collective.transaction.created', data: { transaction: { uuid: '0c0e45ac-c54c-47ed-903f-09a3036bffc0', amount: 999999, currency: 'EUR' } } };
  const bad = await call(ocHandler, { url: '/api/webhooks/open-collective?token=wrong', body: JSON.stringify(payload) });
  assert.equal(bad.status, 401);
  let calls = 0;
  setOcFetchForTests(async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).variables.id, '0c0e45ac-c54c-47ed-903f-09a3036bffc0');
    return { json: async () => ({ data: { transaction: { id: '0c0e45ac-c54c-47ed-903f-09a3036bffc0', kind: 'CONTRIBUTION', type: 'CREDIT', isRefund: false, amount: { valueInCents: 2000, currency: 'USD' }, account: { slug: 'openexam-hub' }, fromAccount: { name: 'Backer B', isIncognito: true } } } }) };
  });
  const ok = await call(ocHandler, { url: '/api/webhooks/open-collective?token=oc-test-token-abcdef', body: JSON.stringify(payload) });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(calls, 1);
  assert.equal(ledger().openCollective, 18); // $20 from the API, not the forged 999999
  assert.equal(eventDocs()[0][1].contributor, 'Anonymous backer');
  setOcFetchForTests(async () => ({ json: async () => ({ data: { transaction: { id: 'ffffffff-c54c-47ed-903f-09a3036bffc0', kind: 'CONTRIBUTION', type: 'CREDIT', isRefund: false, amount: { valueInCents: 500, currency: 'EUR' }, account: { slug: 'someone-else' }, fromAccount: { name: 'X' } } } }) }));
  const other = await call(ocHandler, { url: '/api/webhooks/open-collective?token=oc-test-token-abcdef', body: JSON.stringify(payload) });
  assert.equal(other.status, 200);
  assert.ok(other.json.ignored);
  assert.equal(ledger().openCollective, 18);
  setOcFetchForTests(null);
});

test('Link maintenance: dead twice -> approved:false + deadSince, cached roadmap deleted; one dead or error is not enough', async () => {
  reset();
  const res = (id, url, lastCheckedAt, extra = {}) => fs.docs.set(`${PUB}/resources/${id}`, { url, title: id, exams: ['TCF'], approved: true, linkStatus: 'ok', lastCheckedAt, ...extra });
  res('a'.repeat(24), 'https://www.rfi.fr/gone', new Date('2026-01-01'));
  res('b'.repeat(24), 'https://www.tv5monde.com/flaky', new Date('2026-01-02'));
  res('c'.repeat(24), 'https://www.goethe.de/fine', new Date('2026-01-03'));
  fs.docs.set(`${PUB}/global_verified_roadmaps/TCF-B2-30`, { roadmap: { verifiedResources: [{ id: 'a'.repeat(24), url: 'https://www.rfi.fr/gone' }] } });
  fs.docs.set(`${PUB}/global_verified_roadmaps/TCF-B1-30`, { roadmap: { verifiedResources: [{ id: 'c'.repeat(24), url: 'https://www.goethe.de/fine' }] } });
  const verdict = { 'https://www.rfi.fr/gone': 'dead', 'https://www.tv5monde.com/flaky': 'error', 'https://www.goethe.de/fine': 'ok' };
  let inFlight = 0;
  let maxInFlight = 0;
  setLinkCheckerForTests(async (url) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    return { status: verdict[url], httpCode: verdict[url] === 'dead' ? 404 : verdict[url] === 'ok' ? 200 : 503, finalUrl: url };
  });
  // v3 scheduling: each check sets nextCheckAt in the future; rewind it to simulate time passing.
  const rewind = () => { for (const [p, d] of fs.docs) if (p.startsWith(`${PUB}/resources/`)) fs.docs.set(p, { ...d, nextCheckAt: new Date('2026-01-01') }); };
  const s1 = await recheckLinks();
  assert.equal(s1.checked, 3);
  assert.ok(fs.docs.get(`${PUB}/resources/${'c'.repeat(24)}`).nextCheckAt > new Date(), 'healthy link scheduled for later');
  assert.ok(fs.docs.get(`${PUB}/link_checks/${'a'.repeat(24)}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`), 'status change logged');
  rewind();
  const a1 = fs.docs.get(`${PUB}/resources/${'a'.repeat(24)}`);
  assert.equal(a1.linkStatus, 'dead');
  assert.equal(a1.consecutiveDead, 1);
  assert.equal(a1.approved, true, 'one dead result is not enough');
  assert.ok(fs.docs.has(`${PUB}/global_verified_roadmaps/TCF-B2-30`));
  const s2 = await recheckLinks();
  const a2 = fs.docs.get(`${PUB}/resources/${'a'.repeat(24)}`);
  assert.equal(a2.consecutiveDead, 2);
  assert.equal(a2.approved, false);
  assert.ok(a2.deadSince instanceof Date);
  assert.deepEqual(s2.newlyDisabled.map((d) => d.id), ['a'.repeat(24)]);
  assert.deepEqual(s2.invalidatedRoadmaps, ['TCF-B2-30']);
  assert.ok(!fs.docs.has(`${PUB}/global_verified_roadmaps/TCF-B2-30`), 'roadmap citing the dead link is deleted');
  assert.ok(fs.docs.has(`${PUB}/global_verified_roadmaps/TCF-B1-30`), 'unrelated roadmap kept');
  const b = fs.docs.get(`${PUB}/resources/${'b'.repeat(24)}`);
  assert.equal(b.linkStatus, 'error');
  assert.equal(b.approved, true, 'errors never disable');
  assert.ok(fs.docs.get(`${PUB}/metrics/link_health`).counts);
  // third run: already disabled -> not "newly" disabled again, deadSince unchanged
  rewind();
  const s3 = await recheckLinks();
  assert.equal(s3.newlyDisabled.length, 0);
  assert.equal(fs.docs.get(`${PUB}/resources/${'a'.repeat(24)}`).deadSince.getTime(), a2.deadSince.getTime());
  // a dead result after an ok resets the streak
  verdict['https://www.goethe.de/fine'] = 'dead';
  rewind();
  await recheckLinks();
  assert.equal(fs.docs.get(`${PUB}/resources/${'c'.repeat(24)}`).approved, true);
  assert.ok(maxInFlight <= 5, `concurrency ${maxInFlight} > 5`);
  setLinkCheckerForTests(null);
});

test('Cron: missing/wrong bearer -> 401', async () => {
  reset();
  assert.equal((await call(cronHandler, { method: 'GET', headers: {} })).status, 401);
  assert.equal((await call(cronHandler, { method: 'GET', headers: { authorization: 'Bearer nope' } })).status, 401);
});

test('Dispatchers: webhooks via api/webhooks/[provider].js keep the raw body (HMAC ok); unknown -> 404; cron/admin routed', async () => {
  reset();
  const payload = sponsorship('created', 500);
  const body = JSON.stringify(payload);
  const headers = { 'content-type': 'application/json', 'x-github-event': 'sponsorship', 'x-github-delivery': 'disp-0000-0001', 'x-hub-signature-256': sign(body) };
  // Vercel passes the dynamic segment in req.query; the dispatcher must not consume the body stream.
  const viaQuery = await call(webhookDispatcher, { url: '/api/webhooks/github-sponsors', headers, body, query: { provider: 'github-sponsors' } });
  assert.equal(viaQuery.status, 200, JSON.stringify(viaQuery.json));
  assert.equal(viaQuery.json.counted, true);
  // Fallback: segment taken from the URL path; same delivery id -> idempotent duplicate.
  const viaUrl = await call(webhookDispatcher, { url: '/api/webhooks/github-sponsors', headers, body });
  assert.equal(viaUrl.status, 200);
  assert.equal(viaUrl.json.duplicate, true);
  const badSig = await call(webhookDispatcher, { url: '/api/webhooks/github-sponsors', headers: { ...headers, 'x-hub-signature-256': sign(body, 'wrong') }, body });
  assert.equal(badSig.status, 401);
  const k = await call(webhookDispatcher, { url: '/api/webhooks/kofi', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: JSON.stringify(kofiPayload({ verification_token: 'nope' })) }).toString() });
  assert.equal(k.status, 401);
  assert.equal((await call(webhookDispatcher, { url: '/api/webhooks/stripe', body: '{}' })).status, 404);
  assert.equal((await call(webhookDispatcher, { url: '/api/webhooks/_private', body: '{}' })).status, 404);
  assert.equal((await call(cronDispatcher, { method: 'GET', url: '/api/cron/recheck-links', headers: {} })).status, 401);
  assert.equal((await call(cronDispatcher, { method: 'GET', url: '/api/cron/nope', headers: {} })).status, 404);
  process.env.ADMIN_SECRET = 'admin-test-secret';
  assert.equal((await call(adminDispatcher, { url: '/api/admin/approve', headers: {}, body: '{}' })).status, 401);
  delete process.env.ADMIN_SECRET;
  assert.equal((await call(adminDispatcher, { url: '/api/admin/delete-everything', headers: {}, body: '{}' })).status, 404);
  assert.equal((await call(publicDispatcher, { method: 'GET', url: '/api/nope', headers: {} })).status, 404);
});

// ------------------------------------------------------------ runner
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok   - ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL - ${t.name}\n       ${err.stack?.split('\n').slice(0, 3).join('\n       ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
