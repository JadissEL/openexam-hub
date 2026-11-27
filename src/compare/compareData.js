/**
 * Shared data for the /compare pages (IDEA-13) and later calculators (IDEA-11).
 * Plain data and pure functions only, so the prerender, the browser and scripts/test-compare.mjs agree.
 *
 * Rules (do not relax them):
 *  - CLB / NCLC numbers come only from IRCC's tables, which live in src/tools/clbData.js and are
 *    re-exported here. Never copy them a second time.
 *  - A CEFR mapping appears only when the exam board itself publishes it, quoted as the board states it,
 *    with its URL and the date we checked it. No cross-exam score equivalences: two tests are lined up
 *    only by the CLB level IRCC gives each of them.
 *  - PTE Academic and PTE Core are different tests. Pearson's CEFR table is for PTE Academic; Pearson's
 *    PTE Core scoring page aligns PTE Core to CLB. Never present the Academic table as a PTE Core table.
 */
export {
  TABLES,
  SKILLS,
  SKILL_LABELS,
  EE_LANGUAGE_URL,
  EE_LANGUAGE_MODIFIED,
  CRS_URL,
  PTE_CORE_SCORING_URL,
  ENGLISH_LAST_VERIFIED,
  PTE_LAST_VERIFIED,
  bandText,
  formatScore
} from '../tools/clbData.js';
import {
  TABLES,
  EE_LANGUAGE_URL,
  PTE_CORE_SCORING_URL,
  bandText,
  LAST_VERIFIED as FRENCH_LAST_VERIFIED,
  ENGLISH_LAST_VERIFIED as ENGLISH_VERIFIED,
  PTE_LAST_VERIFIED as PTE_VERIFIED
} from '../tools/clbData.js';

/** Every board page below was read on this date. */
export const COMPARE_LAST_VERIFIED = '2026-11-27';

export const SOURCE_URLS = {
  IRCC_LANGUAGE: EE_LANGUAGE_URL,
  IELTS_GT: 'https://ielts.org/take-a-test/test-types/ielts-general-training-test',
  IELTS_SCORING: 'https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail',
  IELTS_CEFR: 'https://ielts.org/organisations/ielts-for-organisations/compare-ielts/ielts-and-the-cefr',
  IELTS_CEFR_GUIDE: 'https://ielts.org/news-and-insights/everything-you-need-to-know-about-ielts-and-the-cefr',
  CELPIP_FORMAT: 'https://www.celpip.ca/test-format-scoring/',
  PTE_CORE: 'https://www.pearsonpte.com/pte-core',
  PTE_CORE_SCORING: PTE_CORE_SCORING_URL,
  PTE_ACADEMIC_SCORE: 'https://www.pearsonpte.com/pte-academic/scoring/understand-your-score/',
  // French tests (PR 4)
  TEF_CANADA: 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/presentation/',
  TCF_CANADA: 'https://www.france-education-international.fr/test/tcf-canada',
  IRCC_CITIZENSHIP: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/become-canadian-citizen/eligibility/language-proof/step-5.html',
  ETUDIANT_GOUV: 'https://www.etudiant.gouv.fr/fr/apprendre-et-certifier-son-niveau-de-francais-775',
  CAMPUS_FRANCE_MAROC: 'https://www.maroc.campusfrance.org/pour-tout-savoir-sur-le-tcf-delfdalf-et-tef',
  SERVICE_PUBLIC_NATIONALITE: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F11926',
  // German exams (PR 4)
  GOETHE_EXAMS: 'https://www.goethe.de/de/spr/prf.html',
  TELC_DEUTSCH: 'https://www.telc.net/sprachpruefungen/zertifikatspruefung/deutsch/',
  TELC_C1_HOCHSCHULE: 'https://www.telc.net/sprachpruefungen/zertifikatspruefung/deutsch/telc-deutsch-c1-hochschule/',
  BAMF_SPOUSE_A1: 'https://www.bamf.de/SharedDocs/Anlagen/DE/MigrationAufenthalt/Ehegattennachzug/ehegattennachzug-en.pdf?__blob=publicationFile&v=8',
  BAMF_B1_LIST: 'https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/SprachnachweiseZertifikate/nachweis-b1-zertifkat.pdf?__blob=publicationFile',
  DAAD_GERMAN: 'https://www.daad.de/en/studying-in-germany/living-in-germany/german-language/'
};

/**
 * IELTS and the CEFR, in IELTS's own words (overall bands, not per-skill bands).
 * IELTS_CEFR_GUIDE: "If your organisation requires an IELTS score of 5.5–6.5, this is equivalent to CEFR
 * level B2. IELTS 7–8 correspond to CEFR level C1" and C2 "corresponds approximately to IELTS band 9".
 * IELTS_CEFR: "a C1 minimum threshold would fall between the 6.5 and 7 bands"; the figure uses overall
 * band scores and is not a claim of exact equivalence.
 */
export const IELTS_CEFR = {
  id: 'IELTS_CEFR',
  exam: 'IELTS',
  scoreLabel: 'IELTS overall band',
  rows: [
    { cefr: 'C2', score: 'about 9' },
    { cefr: 'C1', score: '7–8' },
    { cefr: 'B2', score: '5.5–6.5' }
  ],
  note: 'IELTS says these are overall band scores, not the band for each skill, and that there is no one-to-one match between IELTS bands and CEFR levels. IELTS also says a C1 minimum falls between bands 6.5 and 7.',
  sources: [
    { url: SOURCE_URLS.IELTS_CEFR_GUIDE, label: 'IELTS: Everything you need to know about IELTS and the CEFR' },
    { url: SOURCE_URLS.IELTS_CEFR, label: 'IELTS: IELTS and the CEFR' }
  ],
  lastVerified: COMPARE_LAST_VERIFIED
};

/** CELPIP Test levels to CEFR, from Paragon's chart on CELPIP_FORMAT (CELPIP 12 = C2 … CELPIP 2 = A1). */
export const CELPIP_CEFR = {
  id: 'CELPIP_CEFR',
  exam: 'CELPIP',
  scoreLabel: 'CELPIP level',
  rows: [
    { cefr: 'C2', score: '12' },
    { cefr: 'C1', score: '10–11' },
    { cefr: 'B2', score: '7–9' },
    { cefr: 'B1', score: '5–6' },
    { cefr: 'A2', score: '3–4' },
    { cefr: 'A1', score: '2' }
  ],
  note: 'From the chart on CELPIP’s Test Format & Scoring page, which shows how CELPIP levels correspond to CLB and CEFR levels.',
  sources: [{ url: SOURCE_URLS.CELPIP_FORMAT, label: 'CELPIP: Test Format & Scoring' }],
  lastVerified: COMPARE_LAST_VERIFIED
};

/** PTE ACADEMIC (not PTE Core) scores to CEFR, from Pearson's PTE Academic score guide page. */
export const PTE_ACADEMIC_CEFR = {
  id: 'PTE_ACADEMIC_CEFR',
  exam: 'PTE Academic',
  scoreLabel: 'PTE Academic score',
  rows: [
    { cefr: 'C2', score: '85–90' },
    { cefr: 'C1', score: '76–84' },
    { cefr: 'B2', score: '59–75' },
    { cefr: 'B1', score: '43–58' },
    { cefr: 'A2', score: '30–42' },
    { cefr: 'A1', score: '10–29' }
  ],
  note: 'This is Pearson’s table for PTE Academic. It is not a PTE Core table: Pearson’s PTE Core scoring page says PTE Core scores are aligned to the CLB framework, and PTE Academic is not accepted for Express Entry.',
  sources: [{ url: SOURCE_URLS.PTE_ACADEMIC_SCORE, label: 'Pearson: Understand your PTE Academic score' }],
  lastVerified: COMPARE_LAST_VERIFIED
};

/**
 * Test format facts for the versions IRCC accepts, each taken from the board's own page (sourceUrl).
 * Keys are shared so two tests line up row by row. Validity for Express Entry is IRCC's rule.
 */
const EE_VALIDITY = 'IRCC: results must be less than 2 years old when you complete your Express Entry profile and when you apply for permanent residence';
export const TEST_FORMATS = {
  IELTS_GT: {
    name: 'IELTS General Training',
    sourceUrl: SOURCE_URLS.IELTS_GT,
    sourceLabel: 'IELTS: General Training test format and sections',
    extraSources: [{ url: SOURCE_URLS.IELTS_SCORING, label: 'IELTS: IELTS scoring in detail' }],
    rows: {
      owner: 'British Council, IDP IELTS and Cambridge University Press & Assessment (joint owners)',
      version: 'IELTS General Training only. IRCC does not accept IELTS Academic or IELTS One Skill Retake',
      sections: 'Listening, Reading, Writing, Speaking',
      timing: 'Listening about 30 min (plus 10 min to transfer answers to an answer sheet), Reading 60 min, Writing 60 min, Speaking 11–14 min',
      scale: 'A 9-band scale for each section; the overall band is the average of the four, rounded to the nearest half band',
      clb: 'IRCC lists the band that earns each CLB level, per skill',
      validity: EE_VALIDITY
    }
  },
  CELPIP_G: {
    name: 'CELPIP-General',
    sourceUrl: SOURCE_URLS.CELPIP_FORMAT,
    sourceLabel: 'CELPIP: Test Format & Scoring',
    rows: {
      owner: 'Paragon Testing Enterprises',
      version: 'CELPIP-General (the CELPIP Test, all four skills). The CELPIP LS Test covers only listening and speaking',
      sections: 'Listening, Reading, Writing, Speaking',
      timing: 'Listening 46–55 min, Reading 43–56 min, Writing 53 min, Speaking 15 min',
      scale: 'CELPIP levels, with 12 the highest on CELPIP’s chart',
      clb: 'From CELPIP 4 to 10, the CELPIP-General level equals the CLB level on IRCC’s table',
      validity: EE_VALIDITY
    }
  },
  PTE_CORE: {
    name: 'PTE Core',
    sourceUrl: SOURCE_URLS.PTE_CORE,
    sourceLabel: 'Pearson: PTE Core',
    extraSources: [{ url: SOURCE_URLS.PTE_CORE_SCORING, label: 'Pearson: PTE Core scoring (10–90 scale, aligned to CLB)' }],
    rows: {
      owner: 'Pearson',
      version: 'PTE Core only. IRCC says you must take the PTE Core option; PTE Academic is a different test',
      sections: 'Three parts: Speaking & Writing, Reading, Listening',
      timing: 'About 2 hours, computer-based: Speaking & Writing 50–65 min, Reading 27–37 min, Listening 22–37 min',
      scale: 'Scores from 10 to 90 for each skill and overall',
      clb: 'IRCC gives a PTE Core score range for each CLB level, per skill',
      validity: EE_VALIDITY
    }
  }
};

const IRCC_CITIZENSHIP_FR = 'IRCC citizenship: B1 or higher in listening and speaking';
const EE_FR = 'Express Entry: accepted (IRCC)';

Object.assign(TEST_FORMATS, {
  // TEF Canada: CCI Paris Île-de-France's page, read 27 Nov 2026. Score maxima are IRCC's Express Entry scale.
  TEF_CANADA: {
    name: 'TEF Canada',
    sourceUrl: SOURCE_URLS.TEF_CANADA,
    sourceLabel: 'Le français des affaires (CCI Paris Île-de-France): TEF Canada',
    rows: {
      owner: 'Le français des affaires, CCI Paris Île-de-France',
      version: 'TEF Canada. For Express Entry, enter the “Équivalence ancien score” column, not “Score / 699”',
      sections: 'Reading (40 questions), listening (40 questions), writing (2 sections), speaking (2 sections). All four are compulsory for immigration and must be taken on the same day',
      timing: 'Reading 1 h, listening 40 min, writing 1 h, speaking 15 min',
      scale: 'On IRCC’s Express Entry scale: reading up to 300, listening up to 360, writing and speaking up to 450',
      clb: 'IRCC gives a score range for each NCLC level, per skill',
      validity: 'CCI Paris: results certificate valid 2 years from its date of issue. ' + EE_VALIDITY
    }
  },
  // TCF Canada: format from France Éducation international's 2026 candidate manual (as used on /exams/tcf-canada);
  // score maxima from IRCC's table. FEI's site blocks automated checks, so the format row was not re-read today.
  TCF_CANADA: {
    name: 'TCF Canada',
    sourceUrl: SOURCE_URLS.TCF_CANADA,
    sourceLabel: 'France Éducation international: TCF Canada',
    rows: {
      owner: 'France Éducation international',
      version: 'TCF Canada only. The general TCF (tout public) is not on IRCC’s Express Entry list',
      sections: 'Listening (39 questions), reading (39 questions), writing (3 tasks), speaking (3 tasks). All four are compulsory',
      timing: 'Listening 35 min, reading 60 min, writing 60 min, speaking 12 min: 2 h 47 min in total',
      scale: 'On IRCC’s table: listening and reading up to 699, writing and speaking up to 20',
      clb: 'IRCC gives a score range for each NCLC level, per skill',
      validity: EE_VALIDITY
    }
  },
  // DELF / DALF and the TCF: étudiant.gouv.fr, Campus France Maroc, IRCC and Service-Public, read 27 Nov 2026.
  DELF_DALF: {
    name: 'DELF and DALF',
    sourceUrl: SOURCE_URLS.ETUDIANT_GOUV,
    sourceLabel: 'Étudiant.gouv.fr: Apprendre et certifier son niveau de français',
    extraSources: [{ url: SOURCE_URLS.CAMPUS_FRANCE_MAROC, label: 'Campus France Maroc: Pour tout savoir sur le TCF, DELF/DALF et TEF' }],
    rows: {
      kind: 'A diploma, awarded at one CEFR level',
      levels: 'DELF A1, A2, B1, B2; DALF C1, C2',
      skills: 'Listening, reading, writing, speaking',
      results: 'Marked out of 100, 25 per skill. Pass: 50/100 or more, with at least 5/25 in every skill',
      validity: 'Valid for life once obtained',
      expressEntry: 'Not accepted: IRCC lists only TEF Canada and TCF Canada for French',
      citizenshipCa: 'IRCC citizenship: DELF B1 or higher, and any DALF result',
      naturalisationFr: 'Service-Public accepts any diploma attesting at least B2, so DELF B2, DALF C1 or DALF C2 (DELF is not named on that page)'
    }
  },
  TCF_FRENCH: {
    name: 'TCF',
    sourceUrl: SOURCE_URLS.CAMPUS_FRANCE_MAROC,
    sourceLabel: 'Campus France Maroc: Pour tout savoir sur le TCF, DELF/DALF et TEF',
    extraSources: [{ url: SOURCE_URLS.SERVICE_PUBLIC_NATIONALITE, label: 'Service-Public: Nationalité française, justifier de son niveau en français' }],
    rows: {
      kind: 'A test of your level at one moment. It comes in versions: TCF tout public (French university DAP), TCF Canada (IRCC)',
      levels: 'Result placed on the CEFR scale, A1 to C2',
      skills: 'Depends on the version; TCF Canada has listening, reading, writing and speaking',
      results: 'An attestation of your level, not a pass or fail',
      validity: 'Attestation valid 2 years',
      expressEntry: 'TCF Canada only (IRCC). ' + EE_VALIDITY,
      citizenshipCa: 'TCF Canada: B1 or higher in listening and speaking (IRCC)',
      naturalisationFr: 'TCF attestation issued less than 2 years ago (Service-Public), B2 required'
    }
  },
  // Goethe-Zertifikat and telc Deutsch: BAMF, DAAD and telc.net read 27 Nov 2026. goethe.de blocks automated
  // checks, so Goethe facts here come from BAMF and DAAD, plus the level range on the Goethe guide.
  GOETHE: {
    name: 'Goethe-Zertifikat',
    sourceUrl: SOURCE_URLS.GOETHE_EXAMS,
    sourceLabel: 'Goethe-Institut: German exams',
    rows: {
      owner: 'Goethe-Institut',
      levels: 'Goethe-Zertifikat A1 to C2, one exam per level',
      spouseA1: 'Start Deutsch 1 of the Goethe-Institut is one of the certificates BAMF names (leaflet last revised 03/2023)',
      naturalisationB1: 'On BAMF’s list of recognised B1 proofs (dated July 2023): Goethe-Zertifikat B1 and Goethe-Zertifikat B1 (Jugendliche)',
      university: 'DAAD: Goethe-Zertifikat C2 is usually recognised by universities; some programmes also recognise Goethe-Zertifikat B2 and C1',
      practice: 'Free official practice sets on goethe.de (see the Goethe guide)'
    }
  },
  TELC: {
    name: 'telc Deutsch',
    sourceUrl: SOURCE_URLS.TELC_DEUTSCH,
    sourceLabel: 'telc: Deutsch-Prüfungen',
    extraSources: [{ url: SOURCE_URLS.TELC_C1_HOCHSCHULE, label: 'telc: telc Deutsch C1 Hochschule' }],
    rows: {
      owner: 'telc gGmbH',
      levels: 'All CEFR levels, A1 to C2, including dual-level exams (for example telc Deutsch A2·B1) that certify the lower or the higher level',
      spouseA1: 'Start Deutsch 1 of telc is one of the certificates BAMF names (leaflet last revised 03/2023)',
      naturalisationB1: 'On BAMF’s list (July 2023): telc Deutsch A2-B1, Zertifikat Deutsch / telc Deutsch B1, Deutsch B1+ Beruf, B1-B2 Beruf, B1-B2 Pflege and the DTB B1',
      university: 'DAAD: telc Deutsch C1 Hochschule is usually recognised by universities',
      practice: 'Free official mock exams with audio on telc.net (see the telc guide)'
    }
  }
});

export const FRENCH_DIPLOMA_ROWS = [
  ['kind', 'What you get'],
  ['levels', 'Levels'],
  ['skills', 'Skills'],
  ['results', 'Results'],
  ['validity', 'Validity'],
  ['expressEntry', 'Canada: Express Entry'],
  ['citizenshipCa', 'Canada: citizenship'],
  ['naturalisationFr', 'France: naturalisation (B2)']
];

export const GERMAN_EXAM_ROWS = [
  ['owner', 'Run by'],
  ['levels', 'Levels'],
  ['spouseA1', 'Spouse visa (A1)'],
  ['naturalisationB1', 'Naturalisation (B1)'],
  ['university', 'University admission'],
  ['practice', 'Official practice']
];

export const FORMAT_ROW_LABELS = [
  ['owner', 'Run by'],
  ['version', 'Version for Express Entry'],
  ['sections', 'Sections'],
  ['timing', 'Timing'],
  ['scale', 'Score scale'],
  ['clb', 'Link to CLB'],
  ['validity', 'Validity for Express Entry']
];

/** Rows for a side-by-side CLB table: one row per CLB level (10 down to 4), one cell per test. */
export function clbRows(tableIds, skill) {
  return [10, 9, 8, 7, 6, 5, 4].map((level) => ({
    level,
    cells: tableIds.map((id) => {
      const t = TABLES[id];
      const r = t.bands[skill].find((b) => b.level === level);
      return { tableId: id, text: r ? bandTextFor(id, r) : '' };
    })
  }));
}

function bandTextFor(id, r) {
  return bandText(TABLES[id], r);
}

// ---------------------------------------------------------------- CLB / NCLC equivalency table (PR 2)

/** The five tests IRCC accepts for Express Entry, in the order the table shows them. TEF Canada uses the
 *  Express Entry scale (“Équivalence ancien score”), the one IRCC says to enter in a profile. */
export const EQUIVALENCY_TESTS = ['IELTS_GT', 'CELPIP_G', 'PTE_CORE', 'TEF_EXPRESS_ENTRY', 'TCF_CANADA'];

/** Date each IRCC table was last transcribed and re-checked on canada.ca. */
export function tableVerified(id) {
  if (TABLES[id].language === 'fr') return FRENCH_LAST_VERIFIED;
  return id === 'PTE_CORE' ? PTE_VERIFIED : ENGLISH_VERIFIED;
}

/** How IRCC prints the cells: one listed score per level (IELTS, CELPIP) or a score range (PTE, TEF, TCF). */
export function cellKind(id) {
  return TABLES[id].listed ? 'minimum score listed by IRCC' : 'score range listed by IRCC';
}

export const CSV_PATH = '/compare/clb-equivalency-table.csv';

function csvCell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of every cell on the equivalency table: one row per test, skill and level, with its source and date. */
export function clbCsv() {
  const head = ['test', 'scale', 'skill', 'level', 'score', 'cell_type', 'source_url', 'last_verified'];
  const rows = [head];
  for (const id of EQUIVALENCY_TESTS) {
    const t = TABLES[id];
    for (const skill of ['speaking', 'listening', 'reading', 'writing']) {
      for (const level of [10, 9, 8, 7, 6, 5, 4]) {
        const r = t.bands[skill].find((b) => b.level === level);
        rows.push([t.label, t.scheme, skill, level === 10 ? `${t.scheme} 10+` : `${t.scheme} ${level}`, bandText(t, r), cellKind(id), t.sourceUrl, tableVerified(id)]);
      }
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** "6.0 in speaking, 6.0 in listening, …" for one test at one level, straight from the table. */
export function levelSentence(id, level) {
  const t = TABLES[id];
  return ['speaking', 'listening', 'reading', 'writing']
    .map((skill) => `${bandText(t, t.bands[skill].find((b) => b.level === level))} in ${skill}`)
    .join(', ');
}
