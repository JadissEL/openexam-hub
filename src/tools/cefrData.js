// /tools/cefr-converter: a score to CEFR level, ONLY where the test owner (or, for TCF, a French
// government agency) publishes the mapping. Every band below is copied from the source named on it,
// read on CEFR_LAST_VERIFIED. No cross-test conversion, no interpolation: a score the source does not
// place gets no level. PTE Academic is not PTE Core. TEF has no table here because CCI Paris
// Île-de-France publishes no score cut-offs per CEFR level on the pages we could read.
import { IELTS_CEFR, CELPIP_CEFR, PTE_ACADEMIC_CEFR, SOURCE_URLS, COMPARE_LAST_VERIFIED } from '../compare/compareData.js';

export const CEFR_TOOL_PATH = '/tools/cefr-converter';
export const CEFR_LAST_VERIFIED = '2026-11-27';

/** Campus France Maroc "Grille de niveau TCF" (PDF, June 2021): the TCF level grid it links for students. */
export const TCF_CEFR_GRID_URL = 'https://www.maroc.campusfrance.org/system/files/medias/documents/2022-01/grilleniveauxtcf.pdf';
export const TCF_CEFR_PAGE_URL = SOURCE_URLS.CAMPUS_FRANCE_MAROC;
/** France Éducation international's own TCF pages: blocked by a bot check from our servers. */
export const FEI_TCF_URLS = ['https://www.france-education-international.fr/test/tcf-tout-public', 'https://www.france-education-international.fr/test/tcf-canada'];

export const TCF_CEFR = {
  id: 'TCF_CEFR',
  exam: 'TCF',
  scoreLabel: 'TCF score',
  rows: [
    { cefr: 'C2', score: '600–699 points · 18–20/20' },
    { cefr: 'C1', score: '500–599 points · 14–17/20' },
    { cefr: 'B2', score: '400–499 points · 10–13/20' },
    { cefr: 'B1', score: '300–399 points · 6–9/20' },
    { cefr: 'A2', score: '200–299 points · 2–5/20' },
    { cefr: 'A1', score: '101–199 points · 1/20' }
  ],
  note: 'From the TCF level grid Campus France Maroc publishes (dated June 2021): points for the multiple-choice tests (reading, listening, language structures) and marks out of 20 for speaking and writing. France Éducation international, which runs the TCF, did not let our automated check read its own pages, so confirm on its site.',
  sources: [
    { url: TCF_CEFR_GRID_URL, label: 'Campus France Maroc: Grille de niveau TCF (PDF)' },
    { url: TCF_CEFR_PAGE_URL, label: 'Campus France Maroc: Pour tout savoir sur le TCF, DELF/DALF et TEF' }
  ],
  lastVerified: CEFR_LAST_VERIFIED
};

/**
 * Numeric bands per test (inclusive). Each band equals a row of the published table above it.
 * `gaps` lists ranges the source leaves unplaced; they return no level.
 */
export const CEFR_CONVERTERS = {
  IELTS: {
    id: 'IELTS',
    title: 'IELTS',
    table: IELTS_CEFR,
    input: { label: 'IELTS overall band', min: 0, max: 9, step: 0.5 },
    bands: [
      { cefr: 'C2', min: 9, max: 9, approx: true },
      { cefr: 'C1', min: 7, max: 8 },
      { cefr: 'B2', min: 5.5, max: 6.5 }
    ],
    gapNote: (v) =>
      v === 8.5
        ? 'IELTS’s pages put bands 7–8 at C1 and about band 9 at C2, but do not place 8.5.'
        : 'IELTS’s CEFR pages quoted here place bands 5.5 and above only.'
  },
  CELPIP: {
    id: 'CELPIP',
    title: 'CELPIP',
    table: CELPIP_CEFR,
    input: { label: 'CELPIP level (one skill)', min: 1, max: 12, step: 1 },
    bands: [
      { cefr: 'C2', min: 12, max: 12 },
      { cefr: 'C1', min: 10, max: 11 },
      { cefr: 'B2', min: 7, max: 9 },
      { cefr: 'B1', min: 5, max: 6 },
      { cefr: 'A2', min: 3, max: 4 },
      { cefr: 'A1', min: 2, max: 2 }
    ],
    gapNote: () => 'CELPIP’s chart starts at level 2 (A1).'
  },
  PTE_ACADEMIC: {
    id: 'PTE_ACADEMIC',
    title: 'PTE Academic',
    table: PTE_ACADEMIC_CEFR,
    input: { label: 'PTE Academic score', min: 10, max: 90, step: 1 },
    bands: [
      { cefr: 'C2', min: 85, max: 90 },
      { cefr: 'C1', min: 76, max: 84 },
      { cefr: 'B2', min: 59, max: 75 },
      { cefr: 'B1', min: 43, max: 58 },
      { cefr: 'A2', min: 30, max: 42 },
      { cefr: 'A1', min: 10, max: 29 }
    ],
    gapNote: () => 'Pearson’s table covers 10 to 90.'
  },
  TCF_POINTS: {
    id: 'TCF_POINTS',
    title: 'TCF',
    table: TCF_CEFR,
    input: { label: 'TCF score, reading, listening or language structures (points)', min: 100, max: 699, step: 1 },
    bands: [
      { cefr: 'C2', min: 600, max: 699 },
      { cefr: 'C1', min: 500, max: 599 },
      { cefr: 'B2', min: 400, max: 499 },
      { cefr: 'B1', min: 300, max: 399 },
      { cefr: 'A2', min: 200, max: 299 },
      { cefr: 'A1', min: 101, max: 199 }
    ],
    gapNote: () => 'The grid starts at 101 points (A1).'
  },
  TCF_MARKS: {
    id: 'TCF_MARKS',
    title: 'TCF',
    table: TCF_CEFR,
    input: { label: 'TCF speaking or writing mark (out of 20)', min: 0, max: 20, step: 1 },
    bands: [
      { cefr: 'C2', min: 18, max: 20 },
      { cefr: 'C1', min: 14, max: 17 },
      { cefr: 'B2', min: 10, max: 13 },
      { cefr: 'B1', min: 6, max: 9 },
      { cefr: 'A2', min: 2, max: 5 },
      { cefr: 'A1', min: 1, max: 1 }
    ],
    gapNote: () => 'The grid starts at 1/20 (A1).'
  }
};

export const CEFR_TABS = [
  { id: 'IELTS', title: 'IELTS' },
  { id: 'CELPIP', title: 'CELPIP' },
  { id: 'PTE_ACADEMIC', title: 'PTE Academic' },
  { id: 'TCF', title: 'TCF' }
];

/** Parse and place one score. Returns { ok, value, cefr, approx, note } or { ok: false, error }. */
export function cefrFor(converterId, raw) {
  const c = CEFR_CONVERTERS[converterId];
  if (!c) return { ok: false, error: 'Unknown test' };
  const text = String(raw ?? '').trim().replace(',', '.');
  if (text === '') return { ok: false, error: 'empty' };
  const n = Number(text);
  const { min, max, step } = c.input;
  if (!Number.isFinite(n) || n < min || n > max) return { ok: false, error: `Enter a number from ${min} to ${max}.` };
  if (Math.abs(n / step - Math.round(n / step)) > 1e-9) return { ok: false, error: step === 0.5 ? 'IELTS bands go in steps of 0.5.' : 'Enter a whole number.' };
  const hit = c.bands.find((b) => n >= b.min && n <= b.max);
  if (!hit) return { ok: true, value: n, cefr: null, note: c.gapNote(n) };
  return { ok: true, value: n, cefr: hit.cefr, approx: Boolean(hit.approx) };
}

export const CEFR_TOOL_H1 = 'IELTS, CELPIP, PTE Academic and TCF to CEFR level';
export const CEFR_TOOL_TITLE = 'IELTS, CELPIP, PTE, TCF to CEFR converter · OpenExam Hub';
export const CEFR_TOOL_DESCRIPTION =
  'See the CEFR level (A1 to C2) for an IELTS, CELPIP, PTE Academic or TCF score, using only the tables the test owners and Campus France publish.';

/** Page chrome. The date in the lead and the disclaimer stays a {date} placeholder. */
export const CEFR_CHROME = {
  tabs: CEFR_TABS.map((tab) => tab.title),
  crumb: 'CEFR level converter',
  eyebrow: 'Free tool · Published tables only',
  lead: 'Enter a score and see the CEFR level (A1 to C2) its test owner gives it: IELTS, CELPIP and Pearson for PTE Academic, and the TCF level grid Campus France publishes. When a table doesn’t place a score, the tool says so instead of guessing. Checked on {date}.',
  converterTitle: 'Converter',
  stepTest: '1. Pick your test',
  testLabel: 'Test',
  tcfType: 'TCF score type',
  tcfPoints: 'Reading, listening, structures (points)',
  tcfMarks: 'Speaking or writing (/20)',
  stepScore: '2. Enter your score',
  rangePlaceholder: '{min} to {max}',
  emptyResult: 'Your CEFR level shows here.',
  scoreLine: '{exam} {value}',
  marksSuffix: '/20',
  pointsSuffix: ' points',
  about: 'About {cefr}',
  noLevel: 'No CEFR level on the published table',
  fine: 'Not affiliated with any test owner. Tables checked on {date}. A CEFR level is not a score in another test. Nothing you type leaves your device.',
  tablesTitle: 'The published tables',
  tablesLead: 'Each table is quoted as its source states it. They are not conversions between tests.',
  cefrCol: 'CEFR',
  tableRegion: '{exam} to CEFR table',
  missingTitle: 'Tests not on this page',
  missing: [
    { strong: 'TEF and TEF Canada:', text: ' we found no score-to-CEFR table from CCI Paris Île-de-France. For Canada, IRCC gives NCLC levels for TEF Canada.' },
    { strong: 'PTE Core:', text: ' Pearson aligns PTE Core to the Canadian Language Benchmarks, not the CEFR. Pearson’s CEFR table above is for PTE Academic.' },
    { strong: 'DELF, DALF, Goethe and telc:', text: ' each certificate is awarded at one CEFR level, so the level is printed on it.' }
  ],
  canadaBefore: 'Applying in Canada? IRCC uses CLB and NCLC levels, not the CEFR: use the ',
  canadaLink: 'CLB converter',
  canadaAfter: '.',
  faqTitle: 'Questions people ask',
  aimTitle: 'Aiming for B2 or C1?',
  aimBody: 'Build a free day-by-day study plan from official, free practice material.',
  aimButton: 'Pick your exam',
  relatedTitle: 'Related',
  related: [
    { href: '/blog/ielts-to-cefr', label: 'IELTS to CEFR: which IELTS band matches B1, B2, C1 and C2' },
    { href: '/compare/delf-vs-tcf', label: 'DELF vs TCF: levels, validity and acceptance' },
    { href: '/compare/goethe-vs-telc', label: 'Goethe vs telc: German exams by CEFR level' },
    { href: '/compare/ielts-vs-pte', label: 'IELTS vs PTE Core: CLB scores side by side' },
    { href: '/tools/clb-converter', label: 'CLB / NCLC score converter for Canada' }
  ]
};

export const CEFR_TOOL_FAQ = [
  {
    q: 'What IELTS band is C1?',
    a: 'IELTS says bands 7 to 8 correspond to CEFR C1, 5.5 to 6.5 to B2, and about band 9 to C2. These are overall bands, and IELTS says there is no one-to-one match between bands and CEFR levels.'
  },
  {
    q: 'What PTE score is B2?',
    a: 'On Pearson’s table for PTE Academic, 59 to 75 is B2, 76 to 84 is C1 and 85 to 90 is C2. That table is for PTE Academic, not PTE Core: Pearson aligns PTE Core to the Canadian Language Benchmarks instead.'
  },
  {
    q: 'What CELPIP level is B2?',
    a: 'CELPIP’s chart puts levels 7 to 9 at B2, 10 to 11 at C1 and 12 at C2. Lower levels run from 5 to 6 at B1 down to level 2 at A1.'
  },
  {
    q: 'What TCF score is B2?',
    a: 'On the TCF level grid Campus France Maroc publishes, 400 to 499 points (or 10 to 13 out of 20 for speaking and writing) is B2. 500 to 599 is C1 and 600 to 699 is C2.'
  },
  {
    q: 'Why is there no TEF or PTE Core option?',
    a: 'The tool only shows a CEFR level when the test owner publishes the table. We found no score-to-CEFR table from CCI Paris Île-de-France for TEF, and Pearson publishes PTE Core against the CLB, not the CEFR. For Canada, use the CLB converter.'
  },
  {
    q: 'Can I convert an IELTS score into a TCF or CELPIP score?',
    a: 'No. Two tests that both place you at B2 are not equivalent scores, and no test owner publishes such a conversion. Check which test and level the university, employer or government asks for.'
  }
];

export { COMPARE_LAST_VERIFIED };
