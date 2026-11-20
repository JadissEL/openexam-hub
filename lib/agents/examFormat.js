/**
 * Exam format specialist — keeps a per-exam format fact sheet in exam_profiles/{EXAM}.
 *
 * Facts are EXTRACTED from the text of an official 'exam_format' page in the resource library,
 * never recalled from model memory. Post-validation drops any section name that does not appear
 * in the source text and nulls any duration / question count whose number is not in the text.
 * If there is no source page (or extraction yields nothing grounded) it returns null / the old profile.
 * Saved profiles carry sourceUrl, extractedAt and reviewed:false until a human reviews them.
 *
 * @module lib/agents/examFormat
 */
import { generateJson, S } from '../llm.js';
import { examLabel } from '../exams.js';
import { pub } from '../firebaseAdmin.js';
import { resourcesCol } from '../library.js';
import { isOfficialUrl } from '../allowlist.js';
import { fetchPageHtml, htmlToText } from './copyrightAuditor.js';

const MAX_AGE_DAYS = 90;
const MAX_TEXT = 30000;
const profilesCol = () => pub().collection('exam_profiles');

const SCHEMA = S.obj({
  sections: S.arr(
    S.obj({
      name: S.str,
      durationMinutes: { type: ['integer', 'null'] },
      questionCount: { type: ['integer', 'null'] },
      description: S.str
    })
  ),
  scoring: { type: ['string', 'null'] },
  notes: { type: ['string', 'null'] }
});

export function validateProfile(d) {
  if (!d || !Array.isArray(d.sections)) return '"sections" must be an array.';
  for (const [i, s] of d.sections.entries()) {
    if (!s || typeof s.name !== 'string' || !s.name.trim()) return `sections[${i}].name must be a non-empty string.`;
    for (const k of ['durationMinutes', 'questionCount']) {
      if (s[k] != null && !Number.isInteger(s[k])) return `sections[${i}].${k} must be an integer or null.`;
    }
  }
  return null;
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const toMillis = (t) => (t?.toMillis ? t.toMillis() : typeof t === 'string' ? Date.parse(t) || 0 : 0);

/** True when `name` is grounded in `foldedText` (exact, or most significant words present). */
function nameInText(name, foldedText) {
  const n = fold(name).trim();
  if (!n) return false;
  if (foldedText.includes(n)) return true;
  const words = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  if (!words.length) return false;
  const hits = words.filter((w) => foldedText.includes(w)).length;
  return hits / words.length >= 0.75;
}

/** True when the integer appears as a standalone number in the text. */
const numberInText = (n, text) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(text);

/**
 * Pure grounding filter, exported for tests. Removes anything not supported by the source text.
 * @returns {{sections: object[], scoring: string|null, notes: string|null, dropped: number}}
 */
export function groundProfile(data, sourceText) {
  const folded = fold(sourceText);
  let dropped = 0;
  const sections = [];
  for (const s of data?.sections || []) {
    if (!nameInText(s.name, folded)) { dropped++; continue; }
    const dur = Number.isInteger(s.durationMinutes) && s.durationMinutes > 0 && numberInText(s.durationMinutes, sourceText) ? s.durationMinutes : null;
    const qc = Number.isInteger(s.questionCount) && s.questionCount > 0 && numberInText(s.questionCount, sourceText) ? s.questionCount : null;
    if (s.durationMinutes != null && dur == null) dropped++;
    if (s.questionCount != null && qc == null) dropped++;
    sections.push({ name: s.name.trim().slice(0, 120), durationMinutes: dur, questionCount: qc, description: String(s.description || '').trim().slice(0, 500) });
    if (sections.length >= 12) break;
  }
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 1000) : null);
  return { sections, scoring: str(data?.scoring), notes: str(data?.notes), dropped };
}

/** Find the best 'exam_format' source page for an exam in the library (any level). */
async function findFormatSource(exam) {
  const snap = await resourcesCol().where('exams', 'array-contains', exam).where('approved', '==', true).limit(60).get();
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => (r.skills || []).includes('exam_format') && ['ok', 'unverified'].includes(r.linkStatus) && isOfficialUrl(r.url));
  rows.sort((a, b) => Number(b.linkStatus === 'ok') - Number(a.linkStatus === 'ok') || (b.usageCount || 0) - (a.usageCount || 0));
  return rows;
}

const publicShape = (p) => (p ? { sections: p.sections || [], scoring: p.scoring ?? null, notes: p.notes ?? null, sourceUrl: p.sourceUrl, reviewed: Boolean(p.reviewed), extractedAt: p.extractedAt ?? null } : null);

/**
 * Get (and refresh if missing or older than 90 days) the format profile for an exam. Never throws.
 * @param {string} exam  e.g. 'TCF'
 * @param {{forceRefresh?: boolean}} [opts]
 * @returns {Promise<{profile: object|null, status: 'cached'|'extracted'|'stale_kept'|'no_source'|'failed', detail: string}>}
 */
export async function getProfile(exam, { forceRefresh = false } = {}) {
  const EXAM = String(exam || '').toUpperCase();
  let existing = null;
  try {
    const snap = await profilesCol().doc(EXAM).get();
    existing = snap.exists ? snap.data() : null;
    const ageDays = existing ? (Date.now() - toMillis(existing.extractedAt)) / 864e5 : Infinity;
    if (existing && !forceRefresh && ageDays < MAX_AGE_DAYS && existing.sourceUrl) {
      return { profile: publicShape(existing), status: 'cached', detail: `Official format blueprint from ${existing.sourceUrl} (checked ${Math.floor(ageDays)} days ago${existing.reviewed ? ', reviewed' : ''})` };
    }
  } catch (err) {
    return { profile: null, status: 'failed', detail: `could not read exam profile: ${err?.message || 'unknown'}` };
  }

  const keepOld = (why) =>
    existing?.sourceUrl
      ? { profile: publicShape(existing), status: 'stale_kept', detail: `${why}; kept previous profile from ${existing.sourceUrl}` }
      : null;

  let sources;
  try {
    sources = await findFormatSource(EXAM);
  } catch (err) {
    return keepOld('library lookup failed') || { profile: null, status: 'failed', detail: `library lookup failed: ${err?.message || 'unknown'}` };
  }
  if (!sources.length) return keepOld('no official format page') || { profile: null, status: 'no_source', detail: `no official format page for ${examLabel(EXAM)} in the library yet` };

  // Try up to 2 source pages: the first one with usable text wins.
  for (const src of sources.slice(0, 2)) {
    const page = await fetchPageHtml(src.url, { maxBytes: 1024 * 1024 });
    const text = page.ok ? htmlToText(page.html).slice(0, MAX_TEXT) : '';
    if (text.length < 300) continue; // JS-rendered or bot-blocked page: nothing to ground facts in
    let data;
    try {
      ({ data } = await generateJson({
        agent: 'FORMAT',
        system:
          'You extract exam format facts STRICTLY from the provided official page text. ' +
          'Use ONLY information explicitly stated in the text. If the text does not state a value, use null. ' +
          'Never use outside knowledge. Section names must be copied as written in the text (same language).',
        prompt:
          `Exam: ${EXAM}\nSource URL: ${src.url}\n\nOFFICIAL PAGE TEXT (between the markers):\n<<<\n${text}\n>>>\n\n` +
          'Return {sections:[{name, durationMinutes (integer or null), questionCount (integer or null), description}], scoring (string or null), notes (string or null)}. ' +
          'If the text describes no exam sections, return an empty sections array.',
        schema: SCHEMA,
        validate: validateProfile,
        temperature: 0
      }));
    } catch (err) {
      return keepOld('extraction failed') || { profile: null, status: 'failed', detail: `format extraction failed: ${err?.message || 'unknown'}` };
    }
    const grounded = groundProfile(data, text);
    if (!grounded.sections.length) continue;
    const doc = {
      exam: EXAM,
      sections: grounded.sections,
      scoring: grounded.scoring,
      notes: grounded.notes,
      sourceUrl: src.url,
      sourceResourceId: src.id,
      extractedAt: new Date().toISOString(),
      reviewed: false
    };
    try {
      await profilesCol().doc(EXAM).set(doc);
    } catch {
      /* still usable for this request even if the save failed */
    }
    return { profile: publicShape(doc), status: 'extracted', detail: `Read ${doc.sections.length} exam ${doc.sections.length === 1 ? 'section' : 'sections'} from the official page ${src.url}${grounded.dropped ? `; dropped ${grounded.dropped} ungrounded value(s)` : ''}` };
  }
  return keepOld('source pages had no extractable format text') || { profile: null, status: 'no_source', detail: 'source page text was empty or described no sections (possibly JS-rendered or bot-blocked)' };
}
