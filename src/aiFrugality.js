/**
 * Plain-language notes on how we keep AI token use down.
 * Every point is backed by a real mechanism in the code; do not add stats
 * that the live public totals cannot support.
 */
export const AI_FRUGALITY_TITLE = 'How we keep AI use small';

export const AI_FRUGALITY_INTRO =
  'Creating a plan uses some AI, so we try not to call it more than we need to.';

export const AI_FRUGALITY_POINTS = [
  {
    t: 'Shared plan cache',
    d: 'If someone already asked for the same exam, level and length, we reuse that plan instead of calling the AI again.'
  },
  {
    t: 'A free account is required',
    d: 'Plan, diagnostic, practice and coaching requests need a signed-in account, so the same prompt cannot be repeated without a login.'
  },
  {
    t: 'Resources ranked in code',
    d: 'The study library is curated and ranked by our own rules, not by an AI model.'
  },
  {
    t: 'Low reasoning effort',
    d: 'When a model is used, we set reasoning effort to low, so it spends less of its budget thinking before it writes. Practice questions use a smaller model.'
  },
  {
    t: 'A second model only if needed',
    d: 'A Gemini fallback is called only when the first provider fails.'
  },
  {
    t: 'Nightly cleanup',
    d: 'Each night we delete expired cached plans and leftover guest accounts.'
  }
];

/** Compact FAQ answer (no invented percentages). */
export const AI_FRUGALITY_FAQ = `${AI_FRUGALITY_INTRO} Identical exam, level and length requests reuse a shared plan instead of calling the AI again. Plan, diagnostic, practice and coaching requests need a free account, so the same prompt cannot be repeated without a login. The resource library is ranked in our own code, not by an AI model. When a model is used, reasoning effort is set to low, and practice questions use a smaller model. A Gemini fallback is called only if the first provider fails. Expired cached plans and leftover guest accounts are removed each night. The funding page publishes AI token totals as they come in.`;
