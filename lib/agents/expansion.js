/**
 * Exam expansion agent (LLM: EXPANSION) — drafts a resource set for a NEW exam for human review.
 *
 * Flow: the model proposes candidate official URLs -> each must be on the allowlist
 * (built-ins + EXTRA_ALLOWED_DOMAINS) -> each is really requested with checkLink() -> passing ones
 * are upserted into the shared library with approved:false, addedBy:'expansion'. Nothing becomes
 * visible to learners until an admin approves it (POST /api/admin/approve).
 * Titles/categories come from the model and are shown to the reviewer as unverified suggestions;
 * the license label is rule-based (licenseFor), never model-provided.
 */
import { generateJson, S } from '../llm.js';
import { isOfficialUrl, normalizeUrl, OFFICIAL_DOMAIN_ALLOWLIST } from '../allowlist.js';
import { checkLink } from '../linkCheck.js';
import { upsertResource, resourceId, resourcesCol, SKILLS } from '../library.js';
import { licenseFor } from './copyrightAuditor.js';

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const MAX_CANDIDATES = 20;
const CHECK_CONCURRENCY = 4;

export class ExpansionInputError extends Error {}

/** Validate & normalise {exam, levels}. Throws ExpansionInputError (-> 400). */
export function validateExpandInput(body) {
  const exam = typeof body?.exam === 'string' ? body.exam.trim().toUpperCase() : '';
  if (!/^[A-Z][A-Z0-9_-]{1,23}$/.test(exam)) throw new ExpansionInputError('exam must be 2-24 chars: letters, digits, _ or - (e.g. DELE, TESTDAF, CELPIP)');
  const levels = Array.isArray(body?.levels) ? [...new Set(body.levels.map((l) => String(l).trim().toUpperCase()))] : [];
  if (!levels.length || levels.length > 6 || levels.some((l) => !LEVELS.includes(l))) throw new ExpansionInputError('levels must be a non-empty array of A1..C2');
  return { exam, levels };
}

const schema = S.obj({
  resources: S.arr(
    S.obj({
      title: S.str,
      url: S.str,
      category: S.str,
      skills: S.arr(S.enum(SKILLS)),
      levels: S.arr(S.enum(LEVELS))
    }),
    { maxItems: MAX_CANDIDATES }
  ),
  examBoardDomains: S.arr(S.str)
});

function validate(data) {
  if (!Array.isArray(data?.resources)) return 'resources must be an array';
  if (!data.resources.length) return 'resources must not be empty';
  for (const [i, r] of data.resources.entries()) {
    if (typeof r?.url !== 'string' || !/^https:\/\//.test(r.url)) return `resources[${i}].url must be an https URL`;
    if (typeof r.title !== 'string' || !r.title.trim()) return `resources[${i}].title missing`;
    if (!Array.isArray(r.skills) || !r.skills.length || r.skills.some((s) => !SKILLS.includes(s))) return `resources[${i}].skills must be a non-empty subset of ${SKILLS.join(',')}`;
    if (r.levels !== undefined && (!Array.isArray(r.levels) || r.levels.some((l) => !LEVELS.includes(l)))) return `resources[${i}].levels must be A1..C2`;
  }
  if (data.examBoardDomains !== undefined && !Array.isArray(data.examBoardDomains)) return 'examBoardDomains must be an array';
  return null;
}

const clip = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * @param {{exam: string, levels: string[]}} input (already validated)
 * @returns {Promise<{status:'ok'|'llm_failed', exam, levels, saved:[], rejected:[], suggestedDomains:[], allowlist:[], model?, error?}>}
 */
export async function expandExam({ exam, levels }) {
  let out;
  try {
    out = await generateJson({
      agent: 'EXPANSION',
      system:
        'You help a free study-planner add a new language certification exam. Propose ONLY free, publicly accessible pages ' +
        'published by the official exam board or an official public cultural/broadcast institute (sample papers, exam format pages, ' +
        'official free practice, official public listening/reading material). Never propose paid courses, piracy, PDFs re-hosted by ' +
        'third parties, forums or blogs. Prefer stable deep links you are confident exist. Every URL will be fetched and checked by a human.',
      prompt:
        `Exam: ${exam}. Target CEFR levels: ${levels.join(', ')}.\n` +
        `Currently allowlisted domains (URLs elsewhere are rejected automatically unless the admin adds the domain): ${OFFICIAL_DOMAIN_ALLOWLIST.join(', ')}.\n` +
        `Return up to ${MAX_CANDIDATES} resources: {title, url, category (short label, e.g. "Sample papers"), skills (subset of ${SKILLS.join(', ')}), levels}. ` +
        'Also list examBoardDomains: the registrable domain(s) of the official exam board site(s) for this exam.',
      schema,
      validate,
      temperature: 0.2
    });
  } catch (err) {
    return { status: 'llm_failed', exam, levels, error: err?.message || 'LLM call failed', saved: [], rejected: [], suggestedDomains: [], allowlist: OFFICIAL_DOMAIN_ALLOWLIST };
  }

  const seen = new Set();
  const candidates = [];
  const rejected = [];
  for (const r of out.data.resources.slice(0, MAX_CANDIDATES)) {
    let url;
    try {
      url = normalizeUrl(r.url.trim());
    } catch {
      rejected.push({ url: r.url, reason: 'not a valid URL' });
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    if (!isOfficialUrl(url)) {
      rejected.push({ url, title: clip(r.title, 160), reason: 'off_allowlist: add the exam board domain to EXTRA_ALLOWED_DOMAINS if it is official' });
      continue;
    }
    candidates.push({ ...r, url });
  }

  const checked = await mapLimit(candidates, CHECK_CONCURRENCY, async (r) => {
    const link = await checkLink(r.url).catch(() => ({ status: 'error', httpCode: null, finalUrl: r.url }));
    return { r, link };
  });

  const saved = [];
  for (const { r, link } of checked) {
    if (link.status !== 'ok' && link.status !== 'unverified') {
      rejected.push({ url: r.url, title: clip(r.title, 160), reason: `link check: ${link.status}${link.httpCode ? ` (HTTP ${link.httpCode})` : ''}`, linkStatus: link.status, httpCode: link.httpCode ?? null });
      continue;
    }
    const finalUrl = link.finalUrl && isOfficialUrl(link.finalUrl) ? normalizeUrl(link.finalUrl) : r.url;
    const rec = {
      url: finalUrl,
      title: clip(r.title, 160) || finalUrl,
      category: clip(r.category, 60) || 'Study resource',
      skills: r.skills.filter((s) => SKILLS.includes(s)),
      exams: [exam],
      levels: (r.levels?.length ? r.levels : levels).filter((l) => LEVELS.includes(l)),
      license: licenseFor(finalUrl),
      linkStatus: link.status,
      httpCode: link.httpCode ?? null
    };
    if (!rec.levels.length) rec.levels = levels; // arrayUnion() with zero args throws
    try {
      const id = await upsertResource(rec, { approved: false, addedBy: 'expansion' });
      // An existing library doc keeps its own approved flag (upsert merges tags only): report the real state.
      const stored = (await resourcesCol().doc(id).get()).data() || {};
      const approved = stored.approved === true;
      saved.push({
        id, ...rec, approved,
        labelNote: `${link.status === 'unverified' ? 'site exists but blocked automated checks' : 'reachable'}${approved ? '; already an approved library resource, now also tagged for this exam' : ''}`
      });
    } catch (err) {
      console.error('[expansion] library write failed', { url: finalUrl, message: err?.message || String(err), code: err?.code });
      rejected.push({ url: finalUrl, reason: 'Could not save this resource to the library', id: resourceId(finalUrl) });
    }
  }

  const suggestedDomains = (out.data.examBoardDomains || [])
    .map((d) => String(d).trim().toLowerCase())
    .filter((d) => /^[a-z0-9.-]{4,253}$/.test(d))
    .slice(0, 10)
    .map((d) => ({ domain: d, alreadyAllowed: isOfficialUrl(`https://${d}/`), note: 'model suggestion — verify it is the official exam board before adding to EXTRA_ALLOWED_DOMAINS' }));

  return { status: 'ok', exam, levels, model: out.model, saved, rejected, suggestedDomains, allowlist: OFFICIAL_DOMAIN_ALLOWLIST };
}
