/**
 * Aggregate AI token usage. No user data is stored.
 *
 * Each call increments:
 *   stats/usage-{YYYY-MM}  — this month, broken down by provider and model
 *   stats/usage-total      — lifetime totals, used for the public net balance
 *
 * Both documents sit in the public `stats` collection (read-only for clients).
 * GET /api/stats exposes a sanitised view, cached briefly.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';
import { costMicroEur, inferProvider, slugKey } from './llmPricing.js';

let nowFn = () => new Date();
/** Test seam: freeze the clock. Pass null to restore. */
export function setUsageClockForTests(fn) {
  nowFn = fn || (() => new Date());
}

export const monthKey = (d = nowFn()) => d.toISOString().slice(0, 7);
export const usageDocId = (month = monthKey()) => `usage-${month}`;
export const USAGE_TOTAL_ID = 'usage-total';

const inc = (n) => FieldValue.increment(n);

// set(..., { merge: true }) does NOT read dots as field paths (only update() does), so the
// breakdowns are written as nested maps. Docs written before this fix hold literal dotted keys
// ("byProvider.groq.calls"); presentUsage() folds those back in.
function counters(prompt, completion, micro) {
  return { calls: inc(1), promptTokens: inc(prompt), completionTokens: inc(completion), costMicroEur: inc(micro) };
}

function incrementFields({ agent, prompt, completion, micro, provider, modelKey, model }) {
  const fields = {
    ...counters(prompt, completion, micro),
    byProvider: { [provider]: counters(prompt, completion, micro) },
    byModel: { [modelKey]: { ...counters(prompt, completion, micro), id: model || 'unknown' } },
    lastModel: model || null,
    lastProvider: provider,
    lastAgent: agent || null,
    updatedAt: FieldValue.serverTimestamp()
  };
  if (agent) {
    fields.byAgent = { [slugKey(agent)]: { calls: inc(1), promptTokens: inc(prompt), completionTokens: inc(completion) } };
  }
  return fields;
}

/**
 * Record one LLM call. Never throws — usage must not break a request.
 * @param {{ agent?: string, usage?: { prompt_tokens?: number, completion_tokens?: number }, model?: string, baseUrl?: string }} input
 */
export async function recordTokenUsage({ agent, usage = {}, model, baseUrl } = {}) {
  try {
    const prompt = Number(usage.prompt_tokens) || 0;
    const completion = Number(usage.completion_tokens) || 0;
    if (prompt < 0 || completion < 0) return;
    const provider = inferProvider(model, baseUrl);
    const modelKey = slugKey(model);
    const micro = costMicroEur(provider, model, prompt, completion);
    const month = monthKey();
    const fields = incrementFields({ agent, prompt, completion, micro, provider, modelKey, model });
    const monthly = { ...fields, month };
    const total = { ...fields };
    const col = pub().collection('stats');
    await Promise.all([
      col.doc(usageDocId(month)).set(monthly, { merge: true }),
      col.doc(USAGE_TOTAL_ID).set(total, { merge: true })
    ]);
  } catch {
    /* metrics must never break a request */
  }
}

function presentMap(map, money = true) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [k, v] of Object.entries(map)) {
    if (!v || typeof v !== 'object') continue;
    const row = {
      calls: Number(v.calls) || 0,
      promptTokens: Number(v.promptTokens) || 0,
      completionTokens: Number(v.completionTokens) || 0
    };
    if (money) row.costEur = Math.round(((Number(v.costMicroEur) || 0) / 1e6) * 100) / 100;
    if (v.id) row.id = String(v.id).slice(0, 80);
    out[k] = row;
  }
  return out;
}

/** Merge a nested map with legacy literal "prefix.key.field" entries written before nested maps. */
function withLegacyDotted(data, prefix) {
  const out = {};
  const add = (key, field, value) => {
    const row = (out[key] = out[key] || {});
    if (field === 'id') row.id = row.id || value;
    else row[field] = (Number(row[field]) || 0) + (Number(value) || 0);
  };
  for (const [k, v] of Object.entries(data[prefix] || {})) {
    if (v && typeof v === 'object') for (const [f, x] of Object.entries(v)) add(k, f, x);
  }
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith(`${prefix}.`)) continue;
    const rest = k.slice(prefix.length + 1);
    const dot = rest.lastIndexOf('.');
    if (dot > 0) add(rest.slice(0, dot), rest.slice(dot + 1), v);
  }
  return out;
}

/** Shape a Firestore usage doc for the public API (numbers only, no internals). */
export function presentUsage(data, fallbackMonth = null) {
  if (!data) {
    return {
      month: fallbackMonth,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      costEur: 0,
      byProvider: {},
      byModel: {},
      updatedAt: null
    };
  }
  return {
    month: data.month || fallbackMonth,
    calls: Number(data.calls) || 0,
    promptTokens: Number(data.promptTokens) || 0,
    completionTokens: Number(data.completionTokens) || 0,
    costEur: Math.round(((Number(data.costMicroEur) || 0) / 1e6) * 100) / 100,
    byProvider: presentMap(withLegacyDotted(data, 'byProvider')),
    byModel: presentMap(withLegacyDotted(data, 'byModel')),
    updatedAt: data.updatedAt?.toDate
      ? data.updatedAt.toDate().toISOString()
      : data.updatedAt instanceof Date
        ? data.updatedAt.toISOString()
        : typeof data.updatedAt === 'string'
          ? data.updatedAt
          : null
  };
}

export function presentTreasury(data) {
  if (!data) {
    return {
      githubSponsors: 0,
      githubOneTime: 0,
      openCollective: 0,
      koFiTips: 0,
      adsenseBridge: 0,
      communityTotalEur: 0,
      month: null
    };
  }
  const githubSponsors = Number(data.githubSponsors) || 0;
  const githubOneTime = Number(data.githubOneTime) || 0;
  const openCollective = Number(data.openCollective) || 0;
  const koFiTips = Number(data.koFiTips) || 0;
  const adsenseBridge = Number(data.adsenseBridge) || 0;
  const communityTotalEur =
    data.communityTotalEur != null && Number.isFinite(Number(data.communityTotalEur))
      ? Number(data.communityTotalEur)
      : githubSponsors + githubOneTime + openCollective + koFiTips;
  return {
    githubSponsors,
    githubOneTime,
    openCollective,
    koFiTips,
    adsenseBridge,
    communityTotalEur: Math.round(communityTotalEur * 100) / 100,
    month: data.month || null
  };
}
