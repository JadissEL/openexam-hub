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

class FakePub {
  constructor() {
    this.docs = new Map();
  }
  root() {
    const fs = this;
    return {
      collection(name) {
        return {
          doc(id) {
            const path = `${name}/${id}`;
            return {
              path,
              id,
              collection(sub) {
                return fs.root().collection(`${name}/${id}/${sub}`);
              },
              async get() {
                const d = fs.docs.get(path);
                return { exists: d !== undefined, id, data: () => (d !== undefined ? structuredClone(d) : undefined) };
              },
              async set(data, opts) {
                fs.write(path, data, opts);
              }
            };
          }
        };
      }
    };
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

function applyUpdate(prev, data) {
  const out = prev;
  for (const [k, v] of Object.entries(data)) {
    const parts = k.split('.');
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
  const res = mockRes();
  await statsHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Cache-Control'], /s-maxage=60/);
  assert.equal(res.body.usage.calls, 3);
  assert.equal(res.body.usage.promptTokens, 900);
  assert.equal(res.body.usage.costEur, 0);
  assert.equal(res.body.usageTotal.calls, 3);
  assert.equal(res.body.treasury.communityTotalEur, 0);
  assert.equal(res.body.stats.cacheHitRate, null, 'no percentage when no plans have been served');
  assert.equal(res.body.stats.plansBuilt, 0);

  fake.docs.set('stats/public', { plansBuilt: 2, cacheHits: 8, cacheHitRate: 0.8, updatedAt: new Date() });
  const res2 = mockRes();
  await statsHandler({ method: 'GET', headers: {} }, res2);
  assert.equal(res2.body.stats.cacheHitRate, 0.8);
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

// Prove FieldValue.increment is what we write (so production Firestore will accept it).
test('increment helper matches firebase-admin NumericIncrementTransform', () => {
  const v = FieldValue.increment(3);
  assert.equal(v.constructor.name, 'NumericIncrementTransform');
  assert.equal(v.operand, 3);
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
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
