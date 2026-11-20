/**
 * Practice generator agent — ONE job: produce ORIGINAL practice items in the style of an exam,
 * for one skill and level, clearly labelled as unofficial.
 *
 *  - reading / grammar / vocabulary: multiple choice (4 options).
 *  - listening: short text transcript + multiple choice.
 *  - writing / speaking: task prompt + model answer + self-check checklist.
 *
 * LLM agent PRACTICE; the system prompt forbids reproducing or paraphrasing official items.
 * Output is strictly validated (shape + target language). Sets are cached in
 * public/data/practice_sets/{EXAM}-{LEVEL}-{skill}-{n}; once 5 sets exist for a key a random
 * cached set is served instead of calling the LLM (saves tokens).
 * Every response carries DISCLAIMER.
 * @module lib/agents/practice
 */
import {
  EXAM_LANG, LANG_NAME, DISCLAIMER, parseExam, parseLevel, parseSkill, parseBoundedInt,
  clean, hasUrl, looksLike, deps, setLearnerDeps
} from './learnerShared.js';

export { setLearnerDeps as __setTestDeps };
export { DISCLAIMER };

export const MAX_SETS_PER_KEY = 5;
export const MAX_COUNT = 10;
const MCQ_SKILLS = ['reading', 'grammar', 'vocabulary', 'listening'];
const OPEN_SKILLS = ['writing', 'speaking'];
export const itemTypeFor = (skill) => (OPEN_SKILLS.includes(skill) ? 'open' : 'mcq');

const MIN_PROMPT_WORDS = { reading: 20, listening: 4, grammar: 3, vocabulary: 3, writing: 8, speaking: 6 };

function schemaFor(skill, count) {
  const base = { id: { type: 'string' }, skill: { type: 'string', enum: [skill] }, prompt: { type: 'string' }, explanation: { type: 'string' } };
  const item = itemTypeFor(skill) === 'open'
    ? { type: 'object', properties: { ...base, modelAnswer: { type: 'string' }, checklist: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 } }, required: ['id', 'skill', 'prompt', 'modelAnswer', 'checklist', 'explanation'] }
    : {
        type: 'object',
        properties: {
          ...base,
          ...(skill === 'listening' ? { transcript: { type: 'string' } } : {}),
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          answerIndex: { type: 'integer', minimum: 0, maximum: 3 }
        },
        required: ['id', 'skill', ...(skill === 'listening' ? ['transcript'] : []), 'prompt', 'options', 'answerIndex', 'explanation']
      };
  return { type: 'object', properties: { items: { type: 'array', items: item, minItems: count, maxItems: count } }, required: ['items'] };
}

const words = (s) => clean(s).split(' ').filter(Boolean).length;
const normOpt = (s) => clean(s).toLowerCase().replace(/[\s.,;:!?¡¿"'«»„“”]+$/g, '');

/** Strict validator (error string fed back to the LLM, or null). Exported for tests. */
export function validatePractice(data, { exam, skill, count }) {
  const lang = EXAM_LANG[exam];
  const items = data?.items;
  if (!Array.isArray(items)) return 'Top-level "items" array is missing.';
  if (items.length !== count) return `Need exactly ${count} items, got ${items.length}.`;
  const ids = new Set();
  const prompts = new Set();
  for (const [i, it] of items.entries()) {
    const at = `items[${i}]`;
    if (!it || typeof it !== 'object') return `${at} is not an object.`;
    if (typeof it.id !== 'string' || !it.id.trim()) return `${at}.id must be a non-empty string.`;
    if (ids.has(it.id)) return `Duplicate id "${it.id}".`;
    ids.add(it.id);
    if (it.skill !== skill) return `${at}.skill must be "${skill}".`;
    if (typeof it.prompt !== 'string' || words(it.prompt) < MIN_PROMPT_WORDS[skill]) return `${at}.prompt is missing or too short for a ${skill} item.`;
    if (prompts.has(normOpt(it.prompt))) return `${at}.prompt duplicates another item.`;
    prompts.add(normOpt(it.prompt));
    if (!looksLike(it.prompt, lang)) return `${at}.prompt must be written in ${LANG_NAME[lang]}.`;
    if (typeof it.explanation !== 'string' || !clean(it.explanation)) return `${at}.explanation is missing.`;
    const texts = [it.prompt, it.explanation];
    if (itemTypeFor(skill) === 'mcq') {
      if (!Array.isArray(it.options) || it.options.length !== 4) return `${at}.options must have exactly 4 entries.`;
      if (it.options.some((o) => typeof o !== 'string' || !clean(o))) return `${at}.options must be non-empty strings.`;
      if (new Set(it.options.map(normOpt)).size !== 4) return `${at}.options contain duplicates.`;
      if (!Number.isInteger(it.answerIndex) || it.answerIndex < 0 || it.answerIndex > 3) return `${at}.answerIndex must be an integer 0..3.`;
      texts.push(...it.options);
      if (skill === 'listening') {
        if (typeof it.transcript !== 'string' || words(it.transcript) < 15) return `${at}.transcript must hold the spoken text (at least 15 words).`;
        if (!looksLike(it.transcript, lang)) return `${at}.transcript must be in ${LANG_NAME[lang]}.`;
        texts.push(it.transcript);
      }
    } else {
      if (typeof it.modelAnswer !== 'string' || words(it.modelAnswer) < 20) return `${at}.modelAnswer must be a full model answer (at least 20 words).`;
      if (!looksLike(it.modelAnswer, lang)) return `${at}.modelAnswer must be in ${LANG_NAME[lang]}.`;
      if (!Array.isArray(it.checklist) || it.checklist.length < 3 || it.checklist.length > 8 || it.checklist.some((c) => typeof c !== 'string' || !clean(c)))
        return `${at}.checklist must be 3..8 non-empty strings.`;
      texts.push(it.modelAnswer, ...it.checklist);
    }
    if (texts.some((t) => hasUrl(t))) return `${at} must not contain URLs or website names.`;
  }
  return null;
}

function normalizeItems(items, skill, setId) {
  return items.map((it, i) => {
    const id = `${setId}-${i + 1}`;
    if (itemTypeFor(skill) === 'open') {
      const modelAnswer = clean(it.modelAnswer, 3000);
      return { id, skill, type: 'open', prompt: clean(it.prompt, 1500), modelAnswer, answer: modelAnswer, checklist: it.checklist.map((c) => clean(c, 200)), explanation: clean(it.explanation, 600) };
    }
    const options = it.options.map((o) => clean(o, 300));
    return {
      id, skill, type: 'mcq',
      ...(skill === 'listening' ? { transcript: clean(it.transcript, 2000) } : {}),
      prompt: clean(it.prompt, skill === 'reading' ? 3000 : 1200),
      options, answerIndex: it.answerIndex, answer: options[it.answerIndex],
      explanation: clean(it.explanation, 600)
    };
  });
}

const FORMAT = {
  reading: 'multiple choice: a short ORIGINAL text (or notice/email/article excerpt you write yourself) in the prompt, then one question; 4 options.',
  grammar: 'multiple choice: a sentence with a gap or form choice; 4 options.',
  vocabulary: 'multiple choice: word choice / meaning in context; 4 options.',
  listening: 'put a short ORIGINAL spoken text (dialogue, message, announcement; 3–8 sentences) in "transcript", ask one question about it in "prompt"; 4 options.',
  writing: 'a writing task prompt (situation, audience, word count), a level-appropriate "modelAnswer", and a "checklist" of 3–8 criteria the learner can tick.',
  speaking: 'a speaking task prompt (situation / question to answer aloud), a level-appropriate "modelAnswer" (what a good spoken answer could say), and a "checklist" of 3–8 criteria.'
};

function systemPrompt(exam, level, skill) {
  const lang = LANG_NAME[EXAM_LANG[exam]];
  return [
    `You write ORIGINAL ${skill} practice items for learners preparing the ${exam} at CEFR ${level}, in ${lang}.`,
    'STRICT COPYRIGHT RULE: never reproduce, translate, adapt or paraphrase items, texts or audio scripts from official exams, official sample papers, past papers or published textbooks. Every text, question and option must be newly invented by you.',
    'Imitate only the general style and difficulty of the exam, not specific items.',
    'Do not include URLs, website names, or claims about the official exam format, scoring or rules.',
    `Write prompts, transcripts, options and model answers in ${lang}. Explanations and checklists may be in simple ${lang}.`,
    `Item format: ${FORMAT[skill]}`,
    itemTypeFor(skill) === 'mcq' ? 'Exactly one correct option per item; answerIndex 0..3; vary the correct position; no duplicate options.' : '',
    'Give each item a unique "id".'
  ].filter(Boolean).join('\n');
}

const keyFor = (exam, level, skill, n) => `${exam}-${level}-${skill}-${n}`;

/**
 * Returns { status:'ok', setId, exam, level, skill, items, disclaimer, source } or
 * { status:'failed', error, disclaimer } if nothing is cached and the LLM is unavailable.
 */
export async function generatePractice(input) {
  const exam = parseExam(input?.exam);
  const level = parseLevel(input?.level);
  const skill = parseSkill(input?.skill);
  const count = parseBoundedInt(input?.count, { name: 'count', min: 1, max: MAX_COUNT, def: 5 });
  const key = keyFor(exam, level, skill, count);
  const d = await deps();
  const ref = d.pub().collection('practice_sets').doc(key);
  const snap = await ref.get();
  const sets = snap.exists && Array.isArray(snap.data().sets) ? snap.data().sets : [];
  const out = (s, source, extra = {}) => ({ status: 'ok', setId: s.setId, exam, level, skill, itemType: itemTypeFor(skill), items: s.items, disclaimer: DISCLAIMER, source, ...extra });
  const randomSet = () => sets[Math.min(sets.length - 1, Math.floor(d.random() * sets.length))];

  if (sets.length >= MAX_SETS_PER_KEY) return out(randomSet(), 'cache');

  try {
    const { data, model } = await d.generateJson({
      agent: 'PRACTICE',
      system: systemPrompt(exam, level, skill),
      prompt: `Write exactly ${count} ${skill} items for ${exam} ${level}. Return {"items":[...]}.`,
      schema: schemaFor(skill, count),
      temperature: 0.8,
      validate: (x) => validatePractice(x, { exam, skill, count })
    });
    const setId = `${key}-s${sets.length + 1}`;
    const entry = { setId, items: normalizeItems(data.items, skill, setId), model: model || null, createdAt: d.now().toISOString() };
    await ref.set({ kind: 'practice', exam, level, skill, count, sets: [...sets, entry].slice(0, MAX_SETS_PER_KEY), updatedAt: entry.createdAt }, { merge: true });
    return out(entry, 'live');
  } catch (err) {
    console.error('[practice] generation failed:', err?.message || err);
    if (sets.length) return out(randomSet(), 'cache', { note: 'Live generation unavailable; served a cached set.' });
    return { status: 'failed', error: 'Practice is temporarily unavailable, please try again shortly.', disclaimer: DISCLAIMER };
  }
}
