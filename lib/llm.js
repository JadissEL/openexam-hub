// Provider-agnostic LLM client for every agent.
// Talks to ANY OpenAI-compatible /v1 endpoint. Default target: a self-hosted
// OmniRoute gateway (github.com/cheaper-inference/OmniRoute, formerly
// diegosouzapw/OmniRoute), which pools free tiers from many providers with
// quota-aware fallback. FreeLLMAPI (github.com/tashfeenahmed/freellmapi) works too. Each agent can use its own
// model or routing profile via LLM_MODEL_<AGENT> (e.g. LLM_MODEL_PLANNER=fusion).
//
// Env:
//   LLM_BASE_URL   e.g. https://llm.yourdomain.com/v1  (OmniRoute listens on :20128/v1 by default)
//   LLM_API_KEY    the OmniRoute key from Dashboard → Endpoints (or any provider key)
//   LLM_MODEL      default model/profile for all agents (default "auto")
//   LLM_MODEL_<AGENT>  per-agent override, AGENT in DISCOVERY|PLANNER|FORMAT|DIAGNOSTIC|COACH|PRACTICE|EXPANSION
//   LLM_FALLBACK_BASE_URL / LLM_FALLBACK_API_KEY / LLM_FALLBACK_MODEL  optional second endpoint if the router is down
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';

export class AgentError extends Error {}

// Messages on errors thrown here can end up in API responses and pipeline traces, so they stay
// generic. Details (env var names, provider bodies, network causes) go to the server log only.
export const AI_UNAVAILABLE = 'AI service temporarily unavailable';

const primary = () => ({ base: process.env.LLM_BASE_URL, key: process.env.LLM_API_KEY });
const fallback = () =>
  process.env.LLM_FALLBACK_BASE_URL
    ? { base: process.env.LLM_FALLBACK_BASE_URL, key: process.env.LLM_FALLBACK_API_KEY, model: process.env.LLM_FALLBACK_MODEL }
    : null;
const modelFor = (agent) => process.env[`LLM_MODEL_${agent}`] || process.env.LLM_MODEL || 'auto';

/**
 * Ask for JSON matching `schema` (standard JSON Schema). Free models don't always honour
 * response_format, so the reply is parsed, validated with `validate`, and retried with the
 * error fed back. Returns { data, usage, model }.
 */
export async function generateJson({ agent, system, prompt, schema, validate = () => null, temperature = 0.3, maxAttempts = 3 }) {
  const targets = [{ ...primary(), model: modelFor(agent) }, fallback()].filter((t) => t && t.base);
  if (!targets.length) {
    console.error('[llm] no LLM endpoint configured (set LLM_BASE_URL / LLM_API_KEY)');
    throw new AgentError(AI_UNAVAILABLE);
  }
  const messages = [
    { role: 'system', content: `${system}\n\nReply with ONE JSON object only, no prose, no markdown fences. It must match this JSON Schema:\n${JSON.stringify(schema)}` },
    { role: 'user', content: prompt }
  ];
  let lastErr;
  for (const t of targets) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(`${t.base.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.key}` },
          body: JSON.stringify({
            model: t.model,
            messages,
            temperature,
            response_format: { type: 'json_schema', json_schema: { name: `${agent.toLowerCase()}_output`, schema, strict: false } }
          }),
          signal: AbortSignal.timeout(60000)
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          console.error(`[llm] ${agent} ${t.model} HTTP ${res.status}: ${detail.slice(0, 300)}`);
          lastErr = new AgentError(`${AI_UNAVAILABLE} (HTTP ${res.status})`);
          if (res.status >= 500 || res.status === 429) {
            await sleep(700 * 2 ** attempt);
            continue;
          }
          break; // 4xx: try the fallback target
        }
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content || '';
        const data = parseJson(text);
        const problem = data == null ? 'Output was not valid JSON.' : validate(data);
        await recordUsage(agent, json.usage, json.model || t.model);
        if (!problem) return { data, usage: json.usage || {}, model: json.model || t.model };
        lastErr = new AgentError(`Invalid ${agent} output: ${problem}`);
        messages.push({ role: 'assistant', content: text.slice(0, 4000) }, { role: 'user', content: `That output was rejected: ${problem} Return corrected JSON only.` });
      } catch (err) {
        console.error(`[llm] ${agent} ${t.model} request failed:`, err?.message || err);
        lastErr = new AgentError(AI_UNAVAILABLE);
        await sleep(700 * 2 ** attempt);
      }
    }
  }
  throw lastErr;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    try {
      return m ? JSON.parse(m[0]) : null;
    } catch {
      return null;
    }
  }
}

async function recordUsage(agent, usage = {}, model) {
  try {
    await pub().collection('metrics').doc('usage').set(
      {
        calls: { [agent]: FieldValue.increment(1) },
        promptTokens: { [agent]: FieldValue.increment(usage.prompt_tokens || 0) },
        completionTokens: { [agent]: FieldValue.increment(usage.completion_tokens || 0) },
        lastModel: model || null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } catch {
    /* metrics must never break a request */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Standard JSON Schema helpers
export const S = {
  str: { type: 'string' },
  num: { type: 'number' },
  int: { type: 'integer' },
  bool: { type: 'boolean' },
  arr: (items, extra = {}) => ({ type: 'array', items, ...extra }),
  obj: (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false }),
  enum: (values) => ({ type: 'string', enum: values })
};
