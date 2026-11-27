/**
 * Single source of truth for exam ids, picker labels, languages, official format
 * blueprints and skill maps. Facts below are taken from official exam-board pages
 * (sourceUrl on each blueprint). Nothing here is invented.
 *
 * @module lib/exams
 */

/** Exams the server will generate plans for (CONTRACT.md). */
export const KNOWN_EXAMS = [
  'TCF', 'TEF', 'TEF_CANADA', 'DELF', 'DALF',
  'IELTS', 'CAMBRIDGE', 'TOEFL', 'CELPIP',
  'GOETHE', 'TELC', 'TESTDAF',
  'DELE'
];

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Known exams -> target language (ISO 639-1). */
export const EXAM_LANG = {
  TCF: 'fr', TEF: 'fr', TEF_CANADA: 'fr', DELF: 'fr', DALF: 'fr',
  GOETHE: 'de', TELC: 'de', TESTDAF: 'de',
  IELTS: 'en', CAMBRIDGE: 'en', TOEFL: 'en', CELPIP: 'en',
  DELE: 'es'
};
export const LANG_NAME = { fr: 'French', de: 'German', en: 'English', es: 'Spanish' };

/** Exam-board registrable domains (tier 1 in lib/algo/rank.js). Keep in sync with allowlist. */
export const EXAM_BOARDS = {
  TCF: ['france-education-international.fr'],
  TEF: ['lefrancaisdesaffaires.fr'],
  TEF_CANADA: ['lefrancaisdesaffaires.fr'],
  DELF: ['france-education-international.fr'],
  DALF: ['france-education-international.fr'],
  IELTS: ['ielts.org', 'britishcouncil.org', 'cambridgeenglish.org'],
  CAMBRIDGE: ['cambridgeenglish.org'],
  TOEFL: ['ets.org'],
  CELPIP: ['celpip.ca', 'paragontesting.ca'],
  GOETHE: ['goethe.de'],
  TELC: ['telc.net'],
  TESTDAF: ['testdaf.de', 'gast.de'],
  DELE: ['cervantes.es', 'cervantes.org']
};

/**
 * Exams shown in the study-app picker and on the landing page.
 * DELF, DALF, CAMBRIDGE, TELC, TESTDAF and generic TEF stay in KNOWN_EXAMS
 * (library / admin) but are not offered in the picker yet.
 */
export const PICKER_EXAMS = [
  {
    id: 'TEF_CANADA',
    label: 'TEF Canada',
    language: 'fr',
    short: 'French · IRCC immigration',
    note: 'Official test of CCI Paris Île-de-France / Le français des affaires, accepted by IRCC for Express Entry. Scores are converted to NCLC. Pick the CEFR level you are aiming for; the exam itself is one sitting for all levels.'
  },
  {
    id: 'TCF',
    label: 'TCF',
    language: 'fr',
    short: 'French',
    note: 'France Éducation international runs two different tests under the TCF name. Choose the one you will sit.',
    variants: [
      {
        id: 'tout_public',
        label: 'TCF tout public',
        short: 'Academic & general',
        note: 'Three compulsory papers (listening, language structures, reading) plus optional writing and speaking.'
      },
      {
        id: 'canada',
        label: 'TCF Canada',
        short: 'IRCC immigration',
        note: 'Four compulsory papers (listening, reading, writing, speaking). There is no language-structures paper. Accepted by IRCC.'
      }
    ],
    defaultVariant: 'tout_public'
  },
  { id: 'IELTS', label: 'IELTS', language: 'en', short: 'English' },
  {
    id: 'CELPIP',
    label: 'CELPIP',
    short: 'English · IRCC immigration',
    language: 'en',
    note: 'Canadian English Language Proficiency Index Program, run by Paragon Testing Enterprises. The CELPIP Test assesses listening, reading, writing and speaking. IRCC accepts the CELPIP-General test for Express Entry. Official CELPIP levels correspond to CLB and CEFR levels. Pick the CEFR level you are aiming for; the exam itself is one sitting for all levels.'
  },
  {
    id: 'TOEFL',
    label: 'TOEFL',
    short: 'English · iBT',
    language: 'en',
    note: 'TOEFL iBT as updated by ETS from 21 January 2026. Pick the CEFR level you are aiming for; official scores are reported on the ETS TOEFL scale.'
  },
  { id: 'GOETHE', label: 'Goethe', language: 'de', short: 'German' },
  {
    id: 'DELE',
    label: 'DELE',
    language: 'es',
    short: 'Spanish · A1–C2',
    note: 'Diplomas de Español como Lengua Extranjera, awarded by the Instituto Cervantes at CEFR levels A1 to C2. Each level is a separate exam.'
  }
];

export const DEFAULT_PICKER_EXAM = 'TEF_CANADA';

export function examLabel(id) {
  const e = String(id || '').trim().toUpperCase();
  return PICKER_EXAMS.find((x) => x.id === e)?.label || e;
}

export function pickerExam(id) {
  return PICKER_EXAMS.find((x) => x.id === String(id || '').trim().toUpperCase()) || null;
}

/**
 * Read ?exam= and optional ?level= from a query string (with or without '?').
 * Unknown or malformed values are ignored (returned as null).
 */
export function parsePlannerQuery(search) {
  const raw = String(search || '');
  const query = raw.startsWith('?') ? raw.slice(1) : raw;
  let params;
  try {
    params = new URLSearchParams(query);
  } catch {
    return { exam: null, level: null };
  }
  const rawId = String(params.get('exam') || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const examId = PLANNER_ALIASES[rawId]?.exam || rawId;
  const exam = pickerExam(examId)?.id || null;
  const levelId = String(params.get('level') || '').trim().toUpperCase();
  let level = LEVELS.includes(levelId) ? levelId : null;
  // IELTS: ?band=6.5 (or ?level=6.5) picks the band and its CEFR level.
  const band = exam === 'IELTS' ? normalizeIeltsBand(params.get('band') || (level ? '' : params.get('level'))) : null;
  if (band) level = ieltsBandLevel(band);
  return band ? { exam, level, band } : { exam, level };
}

/** URL aliases for exam variants: ?exam=TCF_CANADA means TCF with the Canada variant. */
export const PLANNER_ALIASES = { TCF_CANADA: { exam: 'TCF', variant: 'canada' } };

/**
 * Resolve a planner exam id that may be an alias (TCF_CANADA -> TCF + canada) plus an optional
 * ?variant= value. Unknown ids are returned uppercased so the caller can reject them.
 */
export function resolvePlannerExam(examRaw, variantRaw = null) {
  const rawId = String(examRaw || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const alias = PLANNER_ALIASES[rawId];
  const exam = alias?.exam || pickerExam(rawId)?.id || rawId;
  const variant = alias?.variant || normalizeVariant(exam, variantRaw);
  return { exam, variant };
}

/** Higher score = a better match for this exam variant. Used to rank library results. */
export function resourceVariantScore(resource, exam, variant) {
  if (!variant) return 0;
  const listed = resource?.variants || resource?.variant;
  if (Array.isArray(listed) && listed.length) {
    const ids = listed.map((x) => String(x).toLowerCase());
    return ids.includes(String(variant).toLowerCase()) ? 3 : -1;
  }
  const blob = `${resource?.url || ''} ${resource?.title || ''}`.toLowerCase();
  if (exam === 'TCF' && variant === 'canada') {
    if (/\/test\/tcf-tout-public/.test(blob)) return -2;
    if (/\/test\/tcf-canada|presentationtcfcanada/.test(blob)) return 3;
    if (/tcf canada|nclc|ircc|canada\.ca/.test(blob)) return 2;
    if (/\bcanada\b/.test(blob)) return 1;
  }
  if (exam === 'TCF' && variant === 'tout_public') {
    if (/\/test\/tcf-canada|presentationtcfcanada/.test(blob) && !/tout public|\/tcf-tp|tp \/|tp,/.test(blob)) return -1;
    if (/\/test\/tcf-tout-public|tout public/.test(blob)) return 2;
  }
  return 0;
}

/** Stable sort that puts variant-specific official pages first. */
export function preferVariantResources(resources, exam, variant) {
  if (!Array.isArray(resources) || !variant) return resources || [];
  return resources
    .map((r, i) => ({ r, i, s: resourceVariantScore(r, exam, variant) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

function officialSourceTitle(exam, variant) {
  if (exam === 'TCF' && variant === 'canada') return 'France Éducation international — official TCF Canada exam page';
  if (exam === 'TCF') return 'France Éducation international — official TCF tout public page';
  return `Official ${examLabel(exam)} page`;
}

/**
 * Drop the official exam-board page for a different TCF variant, and make sure the
 * variant-accurate official URL is present at the front of the list.
 */
export function withOfficialSource(resources, exam, variant, level) {
  const official = officialProfile(exam, { variant, level });
  const list = Array.isArray(resources) ? [...resources] : [];
  const norm = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
  let out = list;
  if (exam === 'TCF' && variant === 'canada') {
    out = out.filter((r) => !/\/test\/tcf-tout-public\/?$/i.test(r.url || ''));
  } else if (exam === 'TCF' && variant === 'tout_public') {
    out = out.filter((r) => !/\/test\/tcf-canada\/?$/i.test(r.url || ''));
  }
  if (official?.sourceUrl) {
    const i = out.findIndex((r) => norm(r.url) === norm(official.sourceUrl));
    if (i > 0) out = [out[i], ...out.slice(0, i), ...out.slice(i + 1)];
    else if (i < 0) {
      out = [{ id: 'official-source', title: officialSourceTitle(exam, variant), url: official.sourceUrl, official: true, linkStatus: 'ok' }, ...out];
    }
  }
  return out;
}


/**
 * The exam variant asked for in a query string: ?exam=TCF_CANADA, or ?exam=TCF&variant=canada.
 * Returns the normalised variant id for the parsed exam, or null (no variant / not valid).
 */
export function parsePlannerVariant(search) {
  const raw = String(search || '');
  let params;
  try {
    params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  } catch {
    return null;
  }
  const rawId = String(params.get('exam') || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const alias = PLANNER_ALIASES[rawId];
  if (alias) return alias.variant;
  const wanted = params.get('variant');
  if (!wanted || !pickerExam(rawId)?.variants?.length) return null;
  const id = String(wanted).trim().toLowerCase();
  return pickerExam(rawId).variants.some((v) => v.id === id) ? id : null;
}

/** Plan lengths the planner offers (src/App.jsx DAY_OPTIONS). */
export const PLANNER_DAYS = [14, 30, 60];

/** Read ?days= (one of PLANNER_DAYS) from a query string, or null. */
/** True when ?exam, ?level (or IELTS ?band) and ?days are all present and valid: a full plan deep link. */
export function isPlannerDeepLink(search) {
  const q = parsePlannerQuery(search);
  return Boolean(q.exam && q.level && parsePlannerDays(search));
}

export function parsePlannerDays(search) {
  const raw = String(search || '');
  let params;
  try {
    params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  } catch {
    return null;
  }
  const d = Number(String(params.get('days') || '').trim());
  return PLANNER_DAYS.includes(d) ? d : null;
}

/**
 * IELTS is reported in bands (0–9), not CEFR levels. Plans are built per CEFR level, so a target band
 * maps to the level using the official IELTS–CEFR alignment published by IELTS (ielts.org):
 * 4.0–5.0 = B1, 5.5–6.5 = B2, 7.0–8.0 = C1, 8.5–9.0 = C2.
 */
export const IELTS_BANDS = ['4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'];
export function ieltsBandLevel(band) {
  const b = Number(band);
  if (!Number.isFinite(b) || b < 4 || b > 9 || Math.round(b * 2) !== b * 2) return null;
  if (b <= 5) return 'B1';
  if (b <= 6.5) return 'B2';
  if (b <= 8) return 'C1';
  return 'C2';
}
/** Normalise "6.5", "6,5", "65"-free input to a listed band string, or null. */
export function normalizeIeltsBand(raw) {
  const b = Number(String(raw ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(b)) return null;
  const s = b.toFixed(1);
  return IELTS_BANDS.includes(s) ? s : null;
}

export function defaultVariant(exam) {
  return pickerExam(exam)?.defaultVariant || null;
}

/** Normalise a variant id; returns the default (or null) when missing/unknown. */
export function normalizeVariant(exam, variant) {
  const meta = pickerExam(exam);
  if (!meta?.variants?.length) return null;
  const raw = typeof variant === 'string' ? variant.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  const aliases = { ca: 'canada', tcf_canada: 'canada', tp: 'tout_public', tcf_tout_public: 'tout_public', 'tout-public': 'tout_public' };
  const id = aliases[raw] || raw;
  if (meta.variants.some((v) => v.id === id)) return id;
  return meta.defaultVariant || null;
}

export function variantMeta(exam, variant) {
  const meta = pickerExam(exam);
  if (!meta?.variants) return null;
  const id = normalizeVariant(exam, variant);
  return meta.variants.find((v) => v.id === id) || null;
}

/** Suffix used in planKey when the variant is not the exam default. */
export function variantKeySuffix(exam, variant) {
  const id = normalizeVariant(exam, variant);
  if (!id || id === defaultVariant(exam)) return null;
  return id.toUpperCase();
}

function sec(name, durationMinutes, questionCount, description, skills) {
  return { name, durationMinutes, questionCount, description, ...(skills ? { skills } : {}) };
}

/**
 * Official format blueprints, keyed by exam, then optional variant, then optional level.
 * Durations and question counts come from the cited official pages only.
 */
const BLUEPRINTS = {
  TEF_CANADA: {
    sourceUrl: 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/presentation/',
    scoring: 'Each compulsory test is scored separately. CCI Paris publishes an official correspondence table from TEF scores to Canadian NCLC levels, which IRCC uses for Express Entry and other immigration programmes. The results certificate is valid for 2 years from the date of issue.',
    notes: 'For an immigration application, all four tests are compulsory and must be taken on the same day. For a Canadian citizenship application, only listening and speaking are required. Listening, reading and writing are taken on a computer; speaking is face-to-face with an examiner and is recorded for a second marking.',
    sections: [
      sec('Compréhension écrite', 60, 40, 'Reading comprehension: 40 multiple-choice questions (4 options, one correct). +1 for a correct answer, 0 for a wrong or blank answer. You may move freely between questions.', ['reading']),
      sec('Compréhension orale', 40, 40, 'Listening comprehension: 40 multiple-choice questions. Each recording is played once; you cannot go back. +1 for a correct answer, 0 for a wrong or blank answer.', ['listening']),
      sec('Expression écrite', 60, 2, 'Written expression, two timed sections: A (25 minutes) continue a news article, 80 words minimum; B (35 minutes) express and justify a point of view, 200 words minimum.', ['writing']),
      sec('Expression orale', 15, 2, 'Spoken expression, face-to-face with an examiner, two sections: A (5 minutes) obtaining information; B (10 minutes) arguing in order to convince. The test is recorded for double assessment.', ['speaking'])
    ]
  },
  TCF: {
    tout_public: {
      sourceUrl: 'https://www.france-education-international.fr/test/tcf-tout-public',
      scoring: 'Each paper receives its own score, reported as a CEFR level from below A1 to C2. The overall score of the compulsory papers is not a simple arithmetic mean. Optional writing and speaking scores are reported separately and are not folded into that overall score.',
      notes: 'TCF tout public (TCF TP), France Éducation international. Three compulsory multiple-choice papers (1 hour 25 minutes in total) and two optional papers (writing and speaking) that the candidate may add. Source: FEI candidate manual, 2026.',
      sections: [
        sec('Compréhension orale', 25, 29, 'Compulsory. 29 multiple-choice questions.', ['listening']),
        sec('Maîtrise des structures de la langue', 15, 18, 'Compulsory. 18 multiple-choice questions on grammar and language structures.', ['grammar']),
        sec('Compréhension écrite', 45, 29, 'Compulsory. 29 multiple-choice questions.', ['reading']),
        sec('Expression écrite', 60, 3, 'Optional complementary paper. 3 tasks, 60 minutes.', ['writing']),
        sec('Expression orale', 12, 3, 'Optional complementary paper. 3 tasks, 12 minutes, face-to-face with an examiner.', ['speaking'])
      ]
    },
    canada: {
      sourceUrl: 'https://www.france-education-international.fr/test/tcf-canada',
      scoring: 'Each of the four compulsory papers is scored separately and reported as a level used for IRCC applications (NCLC). There is no language-structures paper and no overall average of the four papers.',
      notes: 'TCF Canada (TCF CA), France Éducation international. Four compulsory papers, 2 hours 47 minutes in total, for economic immigration to Canada or Canadian citizenship with IRCC. Source: FEI candidate manual, 2026.',
      sections: [
        sec('Compréhension orale', 35, 39, 'Compulsory. 39 multiple-choice questions.', ['listening']),
        sec('Compréhension écrite', 60, 39, 'Compulsory. 39 multiple-choice questions.', ['reading']),
        sec('Expression écrite', 60, 3, 'Compulsory. 3 tasks, 60 minutes.', ['writing']),
        sec('Expression orale', 12, 3, 'Compulsory. 3 tasks, 12 minutes, face-to-face with an examiner.', ['speaking'])
      ]
    }
  },
  TOEFL: {
    sourceUrl: 'https://www.ets.org/pdfs/toefl/toefl-ibt-test-overview.pdf',
    scoring: 'ETS reports official TOEFL iBT scores on the ETS scale (the 2026 specifications use a 120-point total). OpenExam Hub uses a CEFR target only to pace the study plan; it does not convert TOEFL scores itself.',
    notes: 'TOEFL iBT as updated by ETS from 21 January 2026. Section order: Reading, Listening, Writing, Speaking. Reading and Listening are multistage adaptive; Writing and Speaking are linear. Times below are official approximate base times and do not include directions; as the test adapts, time and item counts may vary. Allow about two hours in total. Source: ETS, “Updated TOEFL iBT Test Overview” and “TOEFL iBT Test: 2026 Update”.',
    sections: [
      sec('Reading', 30, 50, 'Multistage adaptive. About 50 items in about 30 minutes (base time). Task types include Complete the Words, Read in Daily Life, and Read an Academic Passage.', ['reading']),
      sec('Listening', 29, 47, 'Multistage adaptive. About 47 items in about 29 minutes (base time). Task types include Listen and Choose a Response, Listen to a Conversation, Listen to an Announcement, and Listen to an Academic Talk.', ['listening']),
      sec('Writing', 23, 12, 'Linear. 12 items in about 23 minutes. Task types: Build a Sentence, Write an Email, and Write for an Academic Discussion.', ['writing']),
      sec('Speaking', 8, 11, 'Linear. 11 items in about 8 minutes. Task types: Listen and Repeat, and Take an Interview.', ['speaking'])
    ]
  },
  CELPIP: {
    sourceUrl: 'https://www.celpip.ca/test-format-scoring/',
    scoring: 'CELPIP levels are reported from 0 to 12 (or NA if a component was not administered). Paragon’s official chart maps each CELPIP level to a CLB level and a CEFR level; from CELPIP 4 to 12, the CELPIP level equals the CLB level (CELPIP 2 maps to CLB 1 and 2). On that chart, CELPIP 12 corresponds to CEFR C2, 10–11 to C1, 7–9 to B2, 5–6 to B1, 3–4 to A2, and 2 to A1. Scores are valid for two years from the date the score report is issued.',
    notes: 'The CELPIP Test assesses listening, reading, writing and speaking. The CELPIP LS Test assesses only listening and speaking. Listening and Reading contain unscored items used for test development; they have the same format as scored items and can appear anywhere in those tests. Official times below are the ranges or fixed times published on CELPIP’s Test Format & Scoring page. Item counts are not published on that page.',
    sections: [
      sec('Listening', null, null, '46–55 minutes. Six parts: Listening to Problem Solving; Listening to a Daily Life Conversation; Listening for Information; Listening to a News Item; Listening to a Discussion; Listening to Viewpoints. Includes unscored items.', ['listening']),
      sec('Reading', null, null, '43–56 minutes. Four parts: Reading Correspondence; Reading to Apply a Diagram; Reading for Information; Reading for Viewpoints. Includes unscored items.', ['reading']),
      sec('Writing', 53, 2, '53 minutes. Two tasks: Writing an Email; Responding to Survey Questions.', ['writing']),
      sec('Speaking', 15, 8, '15 minutes. Eight tasks: Giving Advice; Talking about a Personal Experience; Describing a Scene; Making Predictions; Comparing and Persuading; Dealing with a Difficult Situation; Expressing Opinions; Describing an Unusual Situation.', ['speaking'])
    ]
  },
  DELE: {
    // Per-level structure published by Instituto Cervantes (centre pages; A1–C1 four papers.
    // C2 follows the official exam guide in force from the May 2024 session).
    sourceUrl: 'https://munich.cervantes.es/es/dele_espanol/informacion_general_espanol/formato_pruebas_espanol.htm',
    scoring: 'Each DELE diploma is a pass/fail exam at a single CEFR level. Instituto Cervantes awards the diploma when the candidate meets the official pass criteria for that level.',
    notes: 'Diplomas de Español como Lengua Extranjera (DELE), Instituto Cervantes, levels A1–C2. Each level is a separate exam. A1–C1 have four papers (reading, listening, writing, speaking). C2 has three tests, including an integrated language-use, reading and listening paper, following the official guide in force from May 2024.',
    byLevel: {
      A1: {
        sourceUrl: 'https://munich.cervantes.es/es/dele_espanol/informacion_general_espanol/formato_pruebas_espanol.htm',
        sections: [
          sec('Comprensión de lectura', 45, null, 'Reading comprehension.', ['reading']),
          sec('Comprensión auditiva', 20, null, 'Listening comprehension.', ['listening']),
          sec('Expresión e interacción escritas', 25, null, 'Written expression and interaction.', ['writing']),
          sec('Expresión e interacción orales', 10, null, 'Oral expression and interaction, 10 minutes, plus 10 minutes of preparation before the interview.', ['speaking'])
        ]
      },
      A2: {
        sourceUrl: 'https://munich.cervantes.es/es/dele_espanol/informacion_general_espanol/formato_pruebas_espanol.htm',
        sections: [
          sec('Comprensión de lectura', 60, null, 'Reading comprehension.', ['reading']),
          sec('Comprensión auditiva', 35, null, 'Listening comprehension.', ['listening']),
          sec('Expresión e interacción escritas', 50, null, 'Written expression and interaction.', ['writing']),
          sec('Expresión e interacción orales', 12, null, 'Oral expression and interaction, 12 minutes, plus 12 minutes of preparation before the interview.', ['speaking'])
        ]
      },
      B1: {
        sourceUrl: 'https://munich.cervantes.es/es/dele_espanol/informacion_general_espanol/formato_pruebas_espanol.htm',
        sections: [
          sec('Comprensión de lectura', 70, null, 'Reading comprehension.', ['reading']),
          sec('Comprensión auditiva', 40, null, 'Listening comprehension.', ['listening']),
          sec('Expresión e interacción escritas', 60, null, 'Written expression and interaction.', ['writing']),
          sec('Expresión e interacción orales', 15, null, 'Oral expression and interaction, 15 minutes, plus 15 minutes of preparation before the interview.', ['speaking'])
        ]
      },
      B2: {
        sourceUrl: 'https://munich.cervantes.es/es/dele_espanol/informacion_general_espanol/formato_pruebas_espanol.htm',
        sections: [
          sec('Comprensión de lectura', 70, null, 'Reading comprehension.', ['reading']),
          sec('Comprensión auditiva', 40, null, 'Listening comprehension.', ['listening']),
          sec('Expresión e interacción escritas', 80, null, 'Written expression and interaction.', ['writing']),
          sec('Expresión e interacción orales', 20, null, 'Oral expression and interaction, 20 minutes, plus 20 minutes of preparation before the interview.', ['speaking'])
        ]
      },
      C1: {
        sourceUrl: 'https://munich.cervantes.es/es/dele_espanol/informacion_general_espanol/formato_pruebas_espanol.htm',
        sections: [
          sec('Comprensión de lectura', 90, null, 'Reading comprehension, including a language-use task on structures and lexis.', ['reading', 'grammar']),
          sec('Comprensión auditiva', 50, null, 'Listening comprehension.', ['listening']),
          sec('Expresión e interacción escritas', 80, null, 'Written expression and interaction.', ['writing']),
          sec('Expresión e interacción orales', 20, null, 'Oral expression and interaction, 20 minutes, plus 20 minutes of preparation before the interview.', ['speaking'])
        ]
      },
      C2: {
        sourceUrl: 'https://pro.cervantes.es/documents/d/tanger/guia_examen_dele_c2_2024_1-pdf?download=true',
        notes: 'Official DELE C2 structure in force from the May 2024 session (Instituto Cervantes exam guide).',
        sections: [
          sec('Uso de la lengua, comprensión de lectura y auditiva', 105, 52, 'Test 1: language use, reading and listening. 7 tasks, 52 items, 105 minutes. Counts as one third of the exam.', ['reading', 'listening', 'grammar']),
          sec('Expresión, mediación e interacción escritas', 150, 3, 'Test 2: written expression, mediation and interaction. 3 tasks, 150 minutes. Counts as one third of the exam.', ['writing']),
          sec('Expresión, mediación e interacción orales', 20, 3, 'Test 3: oral expression, mediation and interaction. 3 tasks, 20 minutes, plus 30 minutes of preparation. Counts as one third of the exam.', ['speaking'])
        ]
      }
    },
    // Default when no level is given: the four-skill A1–C1 shape (no invented shared timings).
    sections: [
      sec('Comprensión de lectura', null, null, 'Reading comprehension. Timing depends on the diploma level (A1–C2).', ['reading']),
      sec('Comprensión auditiva', null, null, 'Listening comprehension. Timing depends on the diploma level (A1–C2).', ['listening']),
      sec('Expresión e interacción escritas', null, null, 'Written expression and interaction. Timing depends on the diploma level (A1–C2).', ['writing']),
      sec('Expresión e interacción orales', null, null, 'Oral expression and interaction. Timing depends on the diploma level (A1–C2).', ['speaking'])
    ]
  }
};

function asProfile(bp, exam) {
  if (!bp) return null;
  return {
    exam,
    sections: (bp.sections || []).map((s) => ({
      name: s.name,
      durationMinutes: s.durationMinutes ?? null,
      questionCount: s.questionCount ?? null,
      description: s.description || '',
      ...(s.skills ? { skills: s.skills } : {})
    })),
    scoring: bp.scoring ?? null,
    notes: bp.notes ?? null,
    sourceUrl: bp.sourceUrl,
    reviewed: false,
    official: true
  };
}

/**
 * Official format profile for an exam (and TCF variant / DELE level when given).
 * Returns null when we do not have a sourced blueprint (the extractor may still fill one).
 */
export function officialProfile(exam, { variant = null, level = null } = {}) {
  const E = String(exam || '').trim().toUpperCase();
  const root = BLUEPRINTS[E];
  if (!root) return null;
  if (root.tout_public || root.canada) {
    const v = normalizeVariant(E, variant) || defaultVariant(E) || 'tout_public';
    const bp = root[v];
    return asProfile(bp, E);
  }
  if (root.byLevel && level && root.byLevel[String(level).toUpperCase()]) {
    const L = String(level).toUpperCase();
    const bp = { ...root, ...root.byLevel[L], sections: root.byLevel[L].sections };
    return asProfile(bp, E);
  }
  return asProfile(root, E);
}

/** Prefer a variant-accurate official blueprint over an extracted profile of a different TCF version. */
export function extractedMatchesVariant(extracted, exam, variant) {
  if (!extracted) return false;
  const v = normalizeVariant(exam, variant);
  if (!v) return true;
  const blob = `${extracted.sourceUrl || ''} ${extracted.notes || ''} ${(extracted.sections || []).map((s) => s.name).join(' ')}`.toLowerCase();
  if (v === 'canada') return /tcf[- ]?canada|tcf ca\b/.test(blob) && !/structures de la langue/.test(blob);
  if (v === 'tout_public') return /tout public|structures de la langue/.test(blob);
  return true;
}

/** Profile used to compute section weights for a plan. */
export function profileForPlan(exam, { variant = null, level = null, extracted = null } = {}) {
  const official = officialProfile(exam, { variant, level });
  if (official && !extractedMatchesVariant(extracted, exam, variant)) return official;
  return extracted || official || null;
}

const EXAM_ALIASES = {
  'DELF/DALF': null, // handled specially
  'DELF-DALF': null,
  GOETHE_ZERTIFIKAT: 'GOETHE',
  'GOETHE-ZERTIFIKAT': 'GOETHE',
  TOEFL_IBT: 'TOEFL',
  'TOEFL-IBT': 'TOEFL',
  TEFCANADA: 'TEF_CANADA',
  'TEF-CANADA': 'TEF_CANADA',
  'TEF CANADA': 'TEF_CANADA',
  CELPIP_G: 'CELPIP',
  'CELPIP-G': 'CELPIP',
  CELPIP_GENERAL: 'CELPIP',
  'CELPIP-GENERAL': 'CELPIP',
  'CELPIP GENERAL': 'CELPIP'
};

/**
 * Map a curator / free-text exam id onto KNOWN_EXAMS.
 * Combined "DELF/DALF" returns both ids. Unknown ids return [].
 * @returns {string[]}
 */
export function mapExamIds(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!s) return [];
  if (s === 'DELF/DALF' || s === 'DELF_DALF' || s === 'DELF-DALF') return ['DELF', 'DALF'];
  const mapped = EXAM_ALIASES[s] || EXAM_ALIASES[s.replace(/-/g, '_')] || s;
  if (KNOWN_EXAMS.includes(mapped)) return [mapped];
  return [];
}

export function isKnownExam(exam) {
  return KNOWN_EXAMS.includes(String(exam || '').trim().toUpperCase());
}
