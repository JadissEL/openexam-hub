// Offline tests for the public expense ledger, AI price table, usage recording and /api/stats.
// No network, no real Firestore. Run: node scripts/test-usage.mjs
import assert from 'node:assert/strict';
import { FieldValue } from 'firebase-admin/firestore';
import { setPubForTests } from '../lib/firebaseAdmin.js';
import { costEur, costMicroEur, inferProvider, priceFor, slugKey } from '../lib/llmPricing.js';
import {
  DOMAIN_AMOUNT_EUR,
  DOMAIN_AMOUNT_USD,
  ECB_USD_PER_EUR_2026_11_20,
  EXPENSES,
  expensesTotalEur,
  formatEur,
  formatMoney,
  netBalanceEur
} from '../src/expenses.js';
import { AI_FRUGALITY_FAQ, AI_FRUGALITY_POINTS, AI_FRUGALITY_TITLE } from '../src/aiFrugality.js';
import { monthKey, presentTreasury, presentUsage, recordTokenUsage, setUsageClockForTests, USAGE_TOTAL_ID, usageDocId } from '../lib/usage.js';
import statsHandler from '../lib/routes/stats.js';
import { FAQ } from '../src/landing/content.js';
import { FIRST_LEARNERS_MAX, learnersProof } from '../src/landing/learners.js';
import {
  getRegisteredUsers,
  isAnonymousUser,
  listRegisteredUserCount,
  setCountRegisteredUsersForTests,
  USER_COUNT_MAX_AGE_MS,
  USERS_DOC_ID
} from '../lib/userCount.js';

class FakePub {
  constructor() {
    this.docs = new Map();
  }
  match(d, f, op, v) {
    if (op === '==') return d[f] === v;
    if (op === 'in') return Array.isArray(v) && v.includes(d[f]);
    if (op === 'array-contains') return Array.isArray(d[f]) && d[f].includes(v);
    return false;
  }
  query(colName, clauses = []) {
    const prefix = `${colName}/`;
    const docs = [...this.docs.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .filter(([, d]) => clauses.every(([f, op, v]) => this.match(d, f, op, v)))
      .map(([p, d]) => ({
        id: p.slice(prefix.length),
        data: () => structuredClone(d)
      }));
    return { docs, empty: !docs.length, size: docs.length };
  }
  root() {
    const fs = this;
    const collection = (name) => {
      const make = (clauses = []) => ({
        doc(id) {
          const path = `${name}/${id}`;
          return {
            path,
            id,
            collection(sub) {
              return collection(`${name}/${id}/${sub}`);
            },
            async get() {
              const d = fs.docs.get(path);
              return { exists: d !== undefined, id, data: () => (d !== undefined ? structuredClone(d) : undefined) };
            },
            async set(data, opts) {
              fs.write(path, data, opts);
            }
          };
        },
        where(f, op, v) {
          return make([...clauses, [f, op, v]]);
        },
        async get() {
          return fs.query(name, clauses);
        },
        count() {
          return {
            async get() {
              return { data: () => ({ count: fs.query(name, clauses).size }) };
            }
          };
        }
      });
      return make();
    };
    return { collection };
  }
  write(path, data, opts) {
    const prev = opts?.merge ? structuredClone(this.docs.get(path) || {}) : {};
    this.docs.set(path, applyUpdate(prev, data));
  }
}

function isIncrement(v) {
  return Boolean(v && typeof v === 'object' && v.constructor?.name === 'NumericIncrementTransform');
}

function isServerTimestamp(v) {
  return Boolean(v && typeof v === 'object' && /ServerTimestamp/i.test(v.constructor?.name || ''));
}

// Mirrors Firestore set(data, { merge: true }): keys are literal (dots are NOT field paths) and
// nested plain objects merge deeply, applying increments at every depth.
function applyUpdate(prev, data) {
  const out = prev;
  for (const [k, v] of Object.entries(data)) {
    const parts = [k];
    if (v && typeof v === 'object' && v.constructor === Object) {
      out[k] = applyUpdate(out[k] && typeof out[k] === 'object' ? out[k] : {}, v);
      continue;
    }
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (isIncrement(v)) cur[last] = (Number(cur[last]) || 0) + v.operand;
    else if (isServerTimestamp(v)) cur[last] = new Date('2026-11-20T20:00:00Z');
    else cur[last] = v;
  }
  return out;
}

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: null, ended: false };
  r.setHeader = (k, v) => {
    r.headers[k] = v;
    return r;
  };
  r.status = (c) => {
    r.statusCode = c;
    return r;
  };
  r.json = (b) => {
    r.body = b;
    r.ended = true;
    return r;
  };
  r.end = () => {
    r.ended = true;
    return r;
  };
  return r;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('domain expense is the sourced $8.50 invoice, converted at the ECB rate to €7.73', () => {
  const domain = EXPENSES.find((e) => e.id === 'domain-openexamhub-org-2026');
  assert.ok(domain);
  assert.equal(domain.amount, DOMAIN_AMOUNT_USD);
  assert.equal(domain.amount, 8.5);
  assert.equal(domain.currency, 'USD');
  assert.equal(domain.date, '2026-11-20');
  assert.equal(domain.kind, 'one-off');
  assert.equal(domain.status, 'recorded');
  assert.equal(domain.fx.rate, ECB_USD_PER_EUR_2026_11_20);
  assert.equal(DOMAIN_AMOUNT_EUR, 7.73);
  assert.equal(domain.amountEur, 7.73);
  assert.match(domain.source, /IN-90052887/);
  assert.match(domain.source, /\$8\.50/);
  const expected = Math.round((8.5 / 1.099) * 100) / 100;
  assert.equal(domain.amountEur, expected);
});

test('Cloudflare Free plan is listed at €0; no invented Vercel or Firebase costs', () => {
  const cf = EXPENSES.find((e) => e.id === 'cloudflare-plan-free');
  assert.equal(cf.amountEur, 0);
  assert.equal(cf.kind, 'monthly');
  assert.match(cf.source, /Free Website/);
  const ids = EXPENSES.map((e) => e.id).join(' ');
  assert.doesNotMatch(ids, /vercel/i);
  assert.doesNotMatch(ids, /firebase/i);
  const { totalEur, pending } = expensesTotalEur();
  assert.equal(totalEur, 7.73);
  assert.equal(pending, 0);
});

test('formatters and net balance: earnings minus expenses minus AI cost', () => {
  assert.equal(formatEur(7.73), '€7.73');
  assert.equal(formatEur(-7.73), '−€7.73');
  assert.equal(formatEur(-7.73, { sign: true }), '−€7.73');
  assert.equal(formatEur(1.2, { sign: true }), '+€1.20');
  assert.equal(formatMoney(8.5, 'USD'), '$8.50');
  assert.equal(formatMoney(null, 'USD'), 'amount pending');
  assert.equal(netBalanceEur(0, 7.73, 0), -7.73);
  assert.equal(netBalanceEur(10, 7.73, 0.27), 2);
  assert.equal(netBalanceEur(7.73, 7.73, 0), 0);
});

test('price table: free-tier models cost €0 but still compute a micro-euro increment of 0', () => {
  assert.equal(priceFor('groq', 'openai/gpt-oss-120b').tier, 'free');
  assert.equal(costEur('groq', 'openai/gpt-oss-120b', 1299, 400), 0);
  assert.equal(costMicroEur('gemini', 'gemini-3.5-flash', 8000, 200), 0);
  assert.equal(priceFor('other', 'mystery-model').tier, 'free');
  assert.equal(inferProvider('openai/gpt-oss-20b', 'https://api.groq.com/openai/v1'), 'groq');
  assert.equal(inferProvider('gemini-3.5-flash', 'https://generativelanguage.googleapis.com/v1beta/openai'), 'gemini');
  assert.equal(inferProvider('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'https://api.cloudflare.com/client/v4/accounts/abc/ai/v1'), 'cloudflare');
  assert.equal(priceFor('cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast').tier, 'free');
  assert.equal(costEur('cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 800, 200), 0);
  assert.equal(slugKey('openai/gpt-oss-120b'), 'openai_gpt-oss-120b');
});

test('recordTokenUsage increments monthly and lifetime docs, with no user fields', async () => {
  const fake = new FakePub();
  setPubForTests(() => fake.root());
  setUsageClockForTests(() => new Date('2026-11-20T19:00:00Z'));
  await recordTokenUsage({
    agent: 'PLANNER',
    usage: { prompt_tokens: 100, completion_tokens: 40 },
    model: 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1'
  });
  await recordTokenUsage({
    agent: 'PRACTICE',
    usage: { prompt_tokens: 50, completion_tokens: 20 },
    model: 'openai/gpt-oss-20b',
    baseUrl: 'https://api.groq.com/openai/v1'
  });
  const month = fake.docs.get('stats/usage-2026-11');
  const total = fake.docs.get('stats/usage-total');
  assert.equal(monthKey(new Date('2026-11-20T19:00:00Z')), '2026-11');
  assert.equal(usageDocId('2026-11'), 'usage-2026-11');
  assert.equal(month.month, '2026-11');
  assert.equal(month.calls, 2);
  assert.equal(month.promptTokens, 150);
  assert.equal(month.completionTokens, 60);
  assert.equal(month.costMicroEur, 0);
  assert.equal(month.byProvider.groq.calls, 2);
  assert.equal(month.byModel["openai_gpt-oss-120b"].calls, 1);
  assert.equal(month.byModel["openai_gpt-oss-20b"].calls, 1);
  assert.equal(total.calls, 2);
  const blob = JSON.stringify(month);
  assert.doesNotMatch(blob, /email|uid|userId|displayName|@/);
  assert.equal(total.month, undefined);
  // A failed write must not throw.
  setPubForTests(() => {
    throw new Error('no firestore');
  });
  await recordTokenUsage({ agent: 'COACH', usage: { prompt_tokens: 1, completion_tokens: 1 }, model: 'x' });
});

test('GET /api/stats returns usage, lifetime totals and treasury; cacheHitRate only with a sample', async () => {
  const fake = new FakePub();
  fake.docs.set('stats/public', {
    resources: 9,
    approvedResources: 9,
    plansBuilt: 0,
    cacheHits: 0,
    cacheHitRate: null,
    fallbackPlans: 0,
    updatedAt: new Date('2026-11-20T16:47:27.607Z')
  });
  fake.docs.set('stats/usage-2026-11', {
    month: '2026-11',
    calls: 3,
    promptTokens: 900,
    completionTokens: 300,
    costMicroEur: 0,
    byProvider: { groq: { calls: 3, promptTokens: 900, completionTokens: 300, costMicroEur: 0 } },
    updatedAt: new Date('2026-11-20T20:00:00Z')
  });
  fake.docs.set(`stats/${USAGE_TOTAL_ID}`, {
    calls: 3,
    promptTokens: 900,
    completionTokens: 300,
    costMicroEur: 0,
    updatedAt: new Date('2026-11-20T20:00:00Z')
  });
  fake.docs.set('treasury/monthly_ledger', {
    month: '2026-11',
    githubSponsors: 0,
    githubOneTime: 0,
    openCollective: 0,
    koFiTips: 0,
    adsenseBridge: 0,
    communityTotalEur: 0
  });
  setPubForTests(() => fake.root());
  setUsageClockForTests(() => new Date('2026-11-20T21:00:00Z'));
  setCountRegisteredUsersForTests(async () => 12);
  const res = mockRes();
  await statsHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Cache-Control'], /s-maxage=60/);
  assert.equal(res.body.usage.calls, 3);
  assert.equal(res.body.usage.promptTokens, 900);
  assert.equal(res.body.usage.costEur, 0);
  assert.equal(res.body.usageTotal.calls, 3);
  assert.equal(res.body.treasury.communityTotalEur, 0);
  assert.equal(res.body.registeredUsers, 12);
  assert.equal(res.body.stats.cacheHitRate, null, 'no percentage when no plans have been served');
  assert.equal(res.body.stats.plansBuilt, 0);

  fake.docs.set('stats/public', { plansBuilt: 2, cacheHits: 8, cacheHitRate: 0.8, updatedAt: new Date() });
  const res2 = mockRes();
  await statsHandler({ method: 'GET', headers: {} }, res2);
  assert.equal(res2.body.stats.cacheHitRate, 0.8);
});

test('GET /api/stats library counts come from the resources collection, not a stale rollup', async () => {
  const fake = new FakePub();
  fake.docs.set('stats/public', {
    resources: 9,
    approvedResources: 9,
    plansBuilt: 4,
    cacheHits: 1,
    cacheHitRate: 0.2,
    fallbackPlans: 0,
    byExam: { TCF: { resources: 3 }, IELTS: { resources: 3 }, GOETHE: { resources: 3 } },
    linkHealth: { ok: 9, unverified: 0, error: 0, dead: 0 },
    updatedAt: new Date('2026-11-20T16:47:27.607Z')
  });
  const live = [
    ['a', { approved: true, linkStatus: 'ok', exams: ['TEF_CANADA'] }],
    ['b', { approved: true, linkStatus: 'ok', exams: ['TEF_CANADA', 'TEF'] }],
    ['c', { approved: true, linkStatus: 'ok', exams: ['TOEFL'] }],
    ['d', { approved: true, linkStatus: 'ok', exams: ['DELE'] }],
    ['e', { approved: true, linkStatus: 'dead', exams: ['TCF'] }],
    ['f', { approved: false, linkStatus: 'ok', exams: ['IELTS'] }]
  ];
  for (const [id, data] of live) fake.docs.set(`resources/${id}`, data);
  setPubForTests(() => fake.root());
  setCountRegisteredUsersForTests(async () => 0);
  const res = mockRes();
  await statsHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stats.resources, 6, 'all resource docs, including unapproved and dead');
  assert.equal(res.body.stats.approvedResources, 5);
  assert.deepEqual(res.body.stats.linkHealth, { ok: 4, unverified: 0, error: 0, dead: 1 });
  assert.deepEqual(res.body.stats.byExam, {
    TEF_CANADA: { resources: 2 },
    TEF: { resources: 1 },
    TOEFL: { resources: 1 },
    DELE: { resources: 1 }
  });
  assert.equal(res.body.stats.byExam.TCF, undefined, 'dead links are excluded from byExam, matching /api/library');
  assert.equal(res.body.stats.byExam.IELTS, undefined, 'unapproved resources are excluded');
  assert.equal(res.body.stats.plansBuilt, 4, 'rollup counters are kept');
  assert.equal(res.body.stats.cacheHits, 1);
  assert.equal(res.body.stats.cacheHitRate, 0.2);
});

test('presentUsage and presentTreasury stay numeric and drop missing docs to zeros', () => {
  const empty = presentUsage(null, '2026-11');
  assert.equal(empty.calls, 0);
  assert.equal(empty.month, '2026-11');
  assert.equal(presentTreasury(null).communityTotalEur, 0);
  assert.equal(presentTreasury({ githubSponsors: 1, githubOneTime: 2, openCollective: 3, koFiTips: 4, adsenseBridge: 0.5 }).communityTotalEur, 10);
});

test('frugality copy covers only mechanisms that exist, and is used in the FAQ', () => {
  assert.equal(AI_FRUGALITY_TITLE, 'How we keep AI use small');
  const titles = AI_FRUGALITY_POINTS.map((p) => p.t);
  assert.deepEqual(titles, [
    'Shared plan cache',
    'A free account is required',
    'Resources ranked in code',
    'Low reasoning effort',
    'A second model only if needed',
    'Nightly cleanup'
  ]);
  const blob = AI_FRUGALITY_POINTS.map((p) => p.d).join(' ') + AI_FRUGALITY_FAQ;
  assert.doesNotMatch(blob, /rate limit/i);
  assert.doesNotMatch(blob, /\d+%/);
  const faq = FAQ.find((f) => f.q === 'How do you keep AI use small?');
  assert.equal(faq.a, AI_FRUGALITY_FAQ);
  const ads = FAQ.find((f) => f.q === 'Is it really free? What’s the catch?');
  assert.match(ads.a, /not live yet/i);
  assert.match(ads.a, /AdSense is under review/i);
  assert.match(ads.a, /logged-in (study )?dashboard/i);
});

test('pending expenses are excluded from the total', () => {
  const { totalEur, pending } = expensesTotalEur([
    { status: 'recorded', amountEur: 7.73 },
    { status: 'pending', amountEur: null },
    { status: 'recorded', amountEur: 0 }
  ]);
  assert.equal(totalEur, 7.73);
  assert.equal(pending, 1);
});

test('learnersProof: no fake numbers; small counts stay honest; larger counts are exact', () => {
  assert.equal(learnersProof(null), null);
  assert.equal(learnersProof(undefined), null);
  assert.equal(learnersProof('nope'), null);
  assert.equal(learnersProof(-1), null);
  assert.equal(learnersProof(0), 'Be one of the first learners.');
  assert.equal(learnersProof(1), 'Be one of the first learners.');
  assert.equal(learnersProof(FIRST_LEARNERS_MAX), 'Be one of the first learners.');
  assert.equal(learnersProof(FIRST_LEARNERS_MAX + 1), `Join ${FIRST_LEARNERS_MAX + 1} learners.`);
  assert.equal(learnersProof(12), 'Join 12 learners.');
  assert.equal(learnersProof(1200), 'Join 1,200 learners.');
});

test('listRegisteredUserCount skips anonymous users and paginates', async () => {
  const pages = [
    {
      users: [
        { email: 'a@example.com', phoneNumber: null, providerData: [{ providerId: 'password' }] },
        { email: null, phoneNumber: null, providerData: [] },
        { email: 'b@example.com', phoneNumber: null, providerData: [{ providerId: 'google.com' }] }
      ],
      pageToken: 'next'
    },
    {
      users: [{ email: 'c@example.com', phoneNumber: null, providerData: [{ providerId: 'password' }] }],
      pageToken: undefined
    }
  ];
  let i = 0;
  const n = await listRegisteredUserCount(async () => pages[i++]);
  assert.equal(n, 3);
  assert.equal(i, 2);
  assert.equal(isAnonymousUser({ email: null, phoneNumber: null, providerData: [] }), true);
  assert.equal(isAnonymousUser({ email: 'a@example.com', providerData: [] }), false);
});

test('getRegisteredUsers reuses a fresh stats/users doc and recounts when stale', async () => {
  const fake = new FakePub();
  setPubForTests(() => fake.root());
  const now = new Date('2026-11-20T21:00:00Z').getTime();
  fake.docs.set(`stats/${USERS_DOC_ID}`, { registeredUsers: 7, updatedAt: new Date(now - 1000) });
  let calls = 0;
  setCountRegisteredUsersForTests(async () => {
    calls += 1;
    return 9;
  });
  assert.equal(await getRegisteredUsers({ now }), 7);
  assert.equal(calls, 0);
  fake.docs.set(`stats/${USERS_DOC_ID}`, { registeredUsers: 7, updatedAt: new Date(now - USER_COUNT_MAX_AGE_MS - 1) });
  assert.equal(await getRegisteredUsers({ now }), 9);
  assert.equal(calls, 1);
  assert.equal(fake.docs.get(`stats/${USERS_DOC_ID}`).registeredUsers, 9);
});

test('GET /api/stats still returns books when the user count cannot be determined', async () => {
  const fake = new FakePub();
  setPubForTests(() => fake.root());
  setCountRegisteredUsersForTests(async () => {
    throw new Error('auth down');
  });
  const res = mockRes();
  await statsHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.registeredUsers, null);
});

// Prove FieldValue.increment is what we write (so production Firestore will accept it).
test('increment helper matches firebase-admin NumericIncrementTransform', () => {
  const v = FieldValue.increment(3);
  assert.equal(v.constructor.name, 'NumericIncrementTransform');
  assert.equal(v.operand, 3);
});


test('presentUsage folds legacy dotted keys written by set(merge) into the breakdowns', () => {
  const out = presentUsage({
    month: '2026-11',
    calls: 3,
    'byProvider.groq.calls': 2,
    'byProvider.groq.promptTokens': 10,
    'byModel.openai_gpt-oss-120b.calls': 2,
    'byModel.openai_gpt-oss-120b.id': 'openai/gpt-oss-120b',
    byProvider: { gemini: { calls: 1, promptTokens: 5, completionTokens: 1, costMicroEur: 0 } }
  });
  assert.equal(out.byProvider.groq.calls, 2);
  assert.equal(out.byProvider.groq.promptTokens, 10);
  assert.equal(out.byProvider.gemini.calls, 1);
  assert.equal(out.byModel['openai_gpt-oss-120b'].id, 'openai/gpt-oss-120b');
});

test('LLM_FALLBACK_MODEL accepts a comma-separated list tried in order', async () => {
  const { fallbackTargets } = await import('../lib/llm.js');
  const env = { LLM_FALLBACK_BASE_URL: 'https://g.example/v1', LLM_FALLBACK_API_KEY: 'k', LLM_FALLBACK_MODEL: 'gemini-3.1-flash-lite, gemini-3-flash-preview' };
  assert.deepEqual(fallbackTargets(env).map((t) => t.model), ['gemini-3.1-flash-lite', 'gemini-3-flash-preview']);
  assert.equal(fallbackTargets({}).length, 0);
  assert.deepEqual(fallbackTargets({ LLM_FALLBACK_BASE_URL: 'x' }).map((t) => t.model), ['auto']);
});

test('LLM_FALLBACK2_* is appended after the first fallback endpoint', async () => {
  const { fallbackTargets } = await import('../lib/llm.js');
  const env = {
    LLM_FALLBACK_BASE_URL: 'https://g.example/v1',
    LLM_FALLBACK_API_KEY: 'gk',
    LLM_FALLBACK_MODEL: 'gemini-3.1-flash-lite,gemini-3-flash-preview',
    LLM_FALLBACK2_BASE_URL: 'https://api.cloudflare.com/client/v4/accounts/abc/ai/v1',
    LLM_FALLBACK2_API_KEY: 'ck',
    LLM_FALLBACK2_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  };
  const targets = fallbackTargets(env);
  assert.deepEqual(targets.map((t) => t.model), [
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  ]);
  assert.equal(targets[2].base, env.LLM_FALLBACK2_BASE_URL);
  assert.equal(targets[2].key, 'ck');
  assert.deepEqual(
    fallbackTargets({
      LLM_FALLBACK2_BASE_URL: 'https://cf.example/v1',
      LLM_FALLBACK2_API_KEY: 'ck',
      LLM_FALLBACK2_MODEL: 'm1, m2'
    }).map((t) => t.model),
    ['m1', 'm2']
  );
});

test('generateJson walks primary, Gemini fallbacks, then the Cloudflare fallback on HTTP errors', async () => {
  const { generateJson } = await import('../lib/llm.js');
  const keys = [
    'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL',
    'LLM_FALLBACK_BASE_URL', 'LLM_FALLBACK_API_KEY', 'LLM_FALLBACK_MODEL',
    'LLM_FALLBACK2_BASE_URL', 'LLM_FALLBACK2_API_KEY', 'LLM_FALLBACK2_MODEL',
    'LLM_REASONING_EFFORT'
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const origFetch = globalThis.fetch;
  const calls = [];
  const fail = (status) => ({
    ok: false,
    status,
    text: async () => `fail ${status}`
  });
  const okBody = { ok: true };
  try {
    Object.assign(process.env, {
      LLM_BASE_URL: 'https://api.groq.com/openai/v1',
      LLM_API_KEY: 'pk',
      LLM_MODEL: 'openai/gpt-oss-120b',
      LLM_FALLBACK_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      LLM_FALLBACK_API_KEY: 'gk',
      LLM_FALLBACK_MODEL: 'gemini-3.1-flash-lite,gemini-3-flash-preview',
      LLM_FALLBACK2_BASE_URL: 'https://api.cloudflare.com/client/v4/accounts/abc/ai/v1',
      LLM_FALLBACK2_API_KEY: 'ck',
      LLM_FALLBACK2_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    });
    delete process.env.LLM_REASONING_EFFORT;
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ url, model: body.model, auth: opts.headers.Authorization });
      if (String(url).includes('cloudflare')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(okBody) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
            model: body.model
          })
        };
      }
      return fail(429);
    };
    const out = await generateJson({
      agent: 'PLANNER',
      system: 'test',
      prompt: 'ping',
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }
    });
    assert.deepEqual(out.data, okBody);
    assert.equal(out.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    assert.deepEqual(calls.map((c) => c.model), [
      'openai/gpt-oss-120b',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    ]);
    assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(calls[3].url, 'https://api.cloudflare.com/client/v4/accounts/abc/ai/v1/chat/completions');
    assert.equal(calls[3].auth, 'Bearer ck');
  } finally {
    globalThis.fetch = origFetch;
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(err);
  }
}
setPubForTests(null);
setUsageClockForTests(null);
setCountRegisteredUsersForTests(null);
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
