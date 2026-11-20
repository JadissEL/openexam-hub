/**
 * Documented EUR prices per 1 million tokens for the models this project calls.
 *
 * The production setup uses official free tiers (Groq for the primary models,
 * Gemini as the fallback), so every listed rate is €0. Token counts are still
 * recorded so the public totals stay honest if a paid rate is added later.
 *
 * To record a paid price: set `prompt` and `completion` (EUR per 1M tokens)
 * and `tier: 'paid'`. Leave unknown free-tier models on DEFAULT_FREE (also €0)
 * rather than inventing a number.
 *
 * Updated: 20 November 2026.
 */
export const DEFAULT_FREE = { prompt: 0, completion: 0, tier: 'free' };

export const LLM_PRICE_TABLE = {
  // Primary and coach (Groq-hosted gpt-oss, free tier).
  'groq:openai/gpt-oss-120b': { ...DEFAULT_FREE },
  'groq:openai_gpt-oss-120b': { ...DEFAULT_FREE },
  'groq:gpt-oss-120b': { ...DEFAULT_FREE },
  // Practice uses the smaller 20B model on the same free tier.
  'groq:openai/gpt-oss-20b': { ...DEFAULT_FREE },
  'groq:openai_gpt-oss-20b': { ...DEFAULT_FREE },
  'groq:gpt-oss-20b': { ...DEFAULT_FREE },
  // Gemini fallback, free tier.
  'gemini:gemini-3.5-flash': { ...DEFAULT_FREE },
  'gemini:gemini-3_5-flash': { ...DEFAULT_FREE }
};

/** Firestore-safe key (dots would be treated as path separators in updates). */
export function slugKey(value, fallback = 'unknown') {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return s || fallback;
}

export function inferProvider(model, baseUrl) {
  let host = '';
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    host = '';
  }
  if (host.includes('groq')) return 'groq';
  if (host.includes('googleapis') || host.includes('generativelanguage') || /\bgoogle\b/.test(host)) return 'gemini';
  if (host.includes('openai.com')) return 'openai';
  const m = String(model || '').toLowerCase();
  if (m.includes('gemini')) return 'gemini';
  if (m.includes('groq')) return 'groq';
  if (host) return slugKey(host.replace(/^api\./, '').replace(/\.com$/, ''), 'other');
  return 'other';
}

export function priceFor(provider, model) {
  const raw = `${provider}:${model || ''}`;
  const slugged = `${provider}:${slugKey(model)}`;
  return LLM_PRICE_TABLE[raw] || LLM_PRICE_TABLE[slugged] || DEFAULT_FREE;
}

/** Euro cost of one call. Free-tier prices are 0. */
export function costEur(provider, model, promptTokens, completionTokens) {
  const p = priceFor(provider, model);
  const prompt = Number(promptTokens) || 0;
  const completion = Number(completionTokens) || 0;
  return (prompt / 1e6) * p.prompt + (completion / 1e6) * p.completion;
}

export function costMicroEur(provider, model, promptTokens, completionTokens) {
  return Math.round(costEur(provider, model, promptTokens, completionTokens) * 1e6);
}
