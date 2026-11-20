/**
 * Shared helpers for the three learner-facing agents (diagnostic, coach, practice).
 *
 * Single job: input validation, exam -> target-language mapping, a cheap language-plausibility
 * check for LLM output, and lazy/injectable access to lib/llm.js + Firestore.
 *
 * Why lazy: lib/llm.js and lib/firebaseAdmin.js initialise firebase-admin at import time
 * (needs FIREBASE_SERVICE_ACCOUNT). Loading them on first use lets the pure logic (validators,
 * scoring, fallbacks) be unit-tested with mocks via setLearnerDeps().
 *
 * @module lib/agents/learnerShared
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Known exams -> target language. Must stay a subset of the contract's known exams. */
export const EXAM_LANG = {
  TCF: 'fr', TEF: 'fr', DELF: 'fr', DALF: 'fr',
  GOETHE: 'de', TELC: 'de', TESTDAF: 'de',
  IELTS: 'en', CAMBRIDGE: 'en'
};
export const LANG_NAME = { fr: 'French', de: 'German', en: 'English' };

/** The six skills a learner is tested / coached on (a subset of library.js SKILLS). */
export const LEARNER_SKILLS = ['listening', 'reading', 'grammar', 'vocabulary', 'writing', 'speaking'];

export const DISCLAIMER = 'Unofficial practice — written by OpenExam Hub, not by the exam board.';

export class BadInput extends Error {}

// ---------- dependency injection ----------
let injected = {};
/** Test hook: override { generateJson, pub, random, now } for all learner agents. Pass {} to reset. */
export function setLearnerDeps(deps = {}) {
  injected = { ...deps };
}
export async function deps() {
  const out = { random: Math.random, now: () => new Date(), ...injected };
  if (!out.generateJson) out.generateJson = (await import('../llm.js')).generateJson;
  if (!out.pub) out.pub = (await import('../firebaseAdmin.js')).pub;
  if (!injected.skipSkillCheck && !injected.generateJson) {
    // Real runtime: make sure our skill names exist in the shared library vocabulary.
    const { SKILLS } = await import('../library.js');
    const missing = LEARNER_SKILLS.filter((s) => !SKILLS.includes(s));
    if (missing.length) throw new Error(`library SKILLS is missing ${missing.join(',')}`);
  }
  return out;
}

// ---------- input validation ----------
export function parseExam(v) {
  const exam = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!EXAM_LANG[exam]) throw new BadInput(`exam must be one of ${Object.keys(EXAM_LANG).join(', ')}`);
  return exam;
}
export function parseLevel(v) {
  const level = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!LEVELS.includes(level)) throw new BadInput('level must be one of A1, A2, B1, B2, C1, C2');
  return level;
}
export function parseSkill(v) {
  const skill = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!LEARNER_SKILLS.includes(skill)) throw new BadInput(`skill must be one of ${LEARNER_SKILLS.join(', ')}`);
  return skill;
}
export function parseBoundedInt(v, { name, min, max, def }) {
  if (v === undefined || v === null || v === '') {
    if (def !== undefined) return def;
    throw new BadInput(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadInput(`${name} must be an integer ${min}..${max}`);
  return n;
}

// ---------- text helpers ----------
export const clean = (s, max = 2000) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const hasUrl = (s) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|fr|de|net|io|eu)\b/i.test(String(s));

const STOP = {
  fr: ['le', 'la', 'les', 'des', 'est', 'et', 'une', 'un', 'du', 'que', 'qui', 'pour', 'dans', 'vous', 'nous', 'je', 'il', 'elle', 'pas', 'au', 'aux', 'sur', 'avec', 'ce', 'cette', 'quel', 'quelle', 'mot', 'phrase', 'texte', "l'", "d'", "j'", "qu'"],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'ich', 'sie', 'mit', 'zu', 'den', 'dem', 'des', 'auf', 'für', 'von', 'wir', 'es', 'im', 'sich', 'welche', 'welches', 'was', 'wie', 'wort', 'satz', 'text'],
  en: ['the', 'and', 'is', 'of', 'to', 'you', 'what', 'which', 'in', 'are', 'was', 'for', 'with', 'this', 'that', 'it', 'he', 'she', 'they', 'word', 'sentence', 'text', 'does', 'do']
};
const CHARS = { fr: /[éèêàçùœâîô]/gi, de: /[äöüß]/gi, en: /$^/g };

/** Per-language plausibility score of a text (stop-word hits + diacritics). */
export function languageScores(text) {
  const t = String(text).toLowerCase();
  const words = t.split(/[^a-zà-ÿœß']+/i).filter(Boolean);
  const out = {};
  for (const lang of Object.keys(STOP)) {
    const set = new Set(STOP[lang]);
    let hits = 0;
    for (const w of words) {
      if (set.has(w)) hits++;
      else if (lang === 'fr' && /^(l|d|j|qu)'/.test(w)) hits++;
    }
    out[lang] = hits + 0.5 * (t.match(CHARS[lang]) || []).length;
  }
  return out;
}
/**
 * True when `text` plausibly is in `lang`. Short texts (< minWords) are not judged (single-word
 * options can't be classified). Otherwise the target language must score highest and > 0.
 */
export function looksLike(text, lang, minWords = 6) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length < minWords) return true;
  const s = languageScores(text);
  const best = Math.max(...Object.values(s));
  return s[lang] > 0 && s[lang] >= best;
}

export function readBody(req) {
  let b;
  try {
    b = req.body; // Vercel parses lazily and throws on malformed JSON
  } catch {
    throw new BadInput('Body must be JSON');
  }
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { throw new BadInput('Body must be JSON'); }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new BadInput('Body must be a JSON object');
  return b;
}
