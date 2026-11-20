/**
 * Discovery agent — asks the LLM for CANDIDATE free resources on the official allowlist.
 *
 * Output is untrusted: every candidate is filtered through isOfficialUrl, normalised, deduped
 * and must still pass the copyright auditor (real HTTP checks) before anything is stored or shown.
 *
 * @module lib/agents/discovery
 */
import { generateJson, S } from '../llm.js';
import { OFFICIAL_DOMAIN_ALLOWLIST, isOfficialUrl, normalizeUrl } from '../allowlist.js';
import { SKILLS } from '../library.js';

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const MAX_CANDIDATES = 8;

const SCHEMA = S.obj({
  candidates: S.arr(
    S.obj({
      title: S.str,
      url: S.str,
      category: S.str,
      skills: S.arr(S.enum(SKILLS)),
      levels: S.arr(S.enum(LEVELS))
    }),
    { maxItems: 12 }
  )
});

/** Shape check fed back to the LLM for automatic retries (lib/llm.js). */
export function validateDiscovery(data) {
  if (!data || !Array.isArray(data.candidates)) return 'Top-level "candidates" array is missing.';
  for (const [i, c] of data.candidates.entries()) {
    if (!c || typeof c.url !== 'string' || typeof c.title !== 'string') return `candidates[${i}] needs string "title" and "url".`;
  }
  return null;
}

const cleanStr = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Pure post-filter: allowlist, normalise, dedupe, exclude, bound tags. Exported for tests.
 * @param {unknown[]} raw
 * @param {Iterable<string>} [excludeUrls]
 * @returns {Array<{title: string, url: string, category: string, skills: string[], levels: string[]}>}
 */
export function filterCandidates(raw, excludeUrls = []) {
  const exclude = new Set();
  for (const u of excludeUrls || []) {
    try { exclude.add(normalizeUrl(u)); } catch { /* ignore bad exclude entries */ }
  }
  const out = [];
  const seen = new Set();
  for (const c of Array.isArray(raw) ? raw : []) {
    const url0 = cleanStr(c?.url, 2048);
    if (!url0 || !isOfficialUrl(url0)) continue;
    let url;
    try { url = normalizeUrl(url0); } catch { continue; }
    if (seen.has(url) || exclude.has(url)) continue;
    seen.add(url);
    const title = cleanStr(c.title, 160);
    const skills = [...new Set((Array.isArray(c.skills) ? c.skills : []).filter((s) => SKILLS.includes(s)))];
    if (!title || !skills.length) continue; // untagged items can't be placed in a plan
    out.push({
      title,
      url,
      category: cleanStr(c.category, 60) || 'Study resource',
      skills,
      levels: [...new Set((Array.isArray(c.levels) ? c.levels : []).map((l) => String(l).toUpperCase()).filter((l) => LEVELS.includes(l)))]
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/**
 * Ask the LLM for up to 8 candidate resources. Never throws.
 * @param {{exam: string, level: string, excludeUrls?: string[]}} input
 * @returns {Promise<{ok: boolean, candidates: object[], rawCount: number, error?: string, usage?: object}>}
 */
export async function discoverResources({ exam, level, excludeUrls = [] }) {
  const exclude = (excludeUrls || []).slice(0, 60);
  const system =
    'You are the Discovery agent of OpenExam Hub, a free study planner for language certification exams. ' +
    'You suggest FREE, publicly accessible study pages that exist on official websites. ' +
    `You may ONLY use URLs whose host is one of these domains or their subdomains: ${OFFICIAL_DOMAIN_ALLOWLIST.join(', ')}. ` +
    'Use https URLs only. Prefer stable section or landing pages over deep links you are unsure about. ' +
    'Never invent a URL; if unsure, omit the item. Every URL will be fetched and checked; broken or paywalled ones are discarded. ' +
    `skills must be chosen from: ${SKILLS.join(', ')}. levels from: ${LEVELS.join(', ')} (empty array = suitable for all levels).`;
  const prompt =
    `Exam: ${exam}\nTarget CEFR level: ${level}\n` +
    `Return up to ${MAX_CANDIDATES} candidates covering different skills (listening, reading, writing, speaking, grammar, vocabulary, mock exams, official exam format information).\n` +
    (exclude.length ? `Do NOT return any of these URLs (already known or rejected):\n${exclude.map((u) => `- ${u}`).join('\n')}\n` : '') +
    'Each candidate: {title, url, category (short label, e.g. "Practice tests"), skills[], levels[]}.';
  try {
    const { data, usage } = await generateJson({ agent: 'DISCOVERY', system, prompt, schema: SCHEMA, validate: validateDiscovery, temperature: 0.3 });
    const raw = data?.candidates || [];
    return { ok: true, candidates: filterCandidates(raw, excludeUrls || []), rawCount: raw.length, usage };
  } catch (err) {
    return { ok: false, candidates: [], rawCount: 0, error: `discovery failed: ${err?.message || 'unknown error'}` };
  }
}
