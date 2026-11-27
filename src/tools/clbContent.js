// Copy for /tools/clb-converter. Pure data so the prerender can build JSON-LD from the same text the
// page shows. Every factual claim here is taken from the canada.ca pages listed in clbData.js.
import { ENGLISH_LAST_VERIFIED, LAST_VERIFIED, PTE_LAST_VERIFIED } from './clbData.js';

export const TOOL_PATH = '/tools/clb-converter';

/** Short ?tab= slugs for the five tests. Missing or invalid values fall back to TEF (the default). */
export const DEFAULT_TOOL_MODE = 'TEF_EXPRESS_ENTRY';
export const TOOL_TABS = {
  tef: 'TEF_EXPRESS_ENTRY',
  tcf: 'TCF_CANADA',
  ielts: 'IELTS_GT',
  celpip: 'CELPIP_G',
  pte: 'PTE_CORE'
};

export function modeFromTabParam(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return Object.hasOwn(TOOL_TABS, key) ? TOOL_TABS[key] : DEFAULT_TOOL_MODE;
}

export function tabFromMode(mode) {
  if (mode === 'TEF_NEW_699') return 'tef';
  const found = Object.entries(TOOL_TABS).find(([, id]) => id === mode);
  return found ? found[0] : 'tef';
}

/** Read ?tab= from a query string (with or without a leading ?). */
export function modeFromSearch(search) {
  const raw = String(search || '');
  const q = raw.startsWith('?') ? raw.slice(1) : raw;
  return modeFromTabParam(new URLSearchParams(q).get('tab'));
}

/** Path + query for a tab slug. The default TEF tab is the bare path, matching the canonical URL. */
export function toolPathForTab(tab) {
  const slug = tabFromMode(modeFromTabParam(tab));
  return slug === 'tef' ? TOOL_PATH : `${TOOL_PATH}?tab=${slug}`;
}

/** Exam-guide slugs that have a matching converter tab. */
export const GUIDE_TOOL_TABS = {
  'tef-canada': 'tef',
  'tcf-canada': 'tcf',
  ielts: 'ielts',
  celpip: 'celpip'
};

/** Converter href for an exam guide. TEF stays on the bare path; other tests add ?tab=. Extra query params (utm, etc.) are kept. */
export function toolPathForGuide(guide, search = '') {
  const mode = modeFromTabParam(GUIDE_TOOL_TABS[guide] || 'tef');
  const qs = searchWithTab(search, mode);
  return qs ? `${TOOL_PATH}${qs}` : TOOL_PATH;
}

/** Update only the tab param in an existing query string; other params are kept. TEF drops `tab`. */
export function searchWithTab(search, mode) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const slug = tabFromMode(mode);
  if (slug === 'tef') params.delete('tab');
  else params.set('tab', slug);
  const next = params.toString();
  return next ? `?${next}` : '';
}

export const TOOL_NAME = 'IELTS, CELPIP, PTE Core, TEF Canada & TCF Canada to CLB (NCLC) score converter';
export const TOOL_LABEL = 'CLB / NCLC score converter';
export const TOOL_H1 = 'IELTS, CELPIP, PTE Core, TEF Canada and TCF Canada to CLB (NCLC) score converter';
export const TOOL_DESCRIPTION =
  'Convert IELTS General Training, CELPIP-General, PTE Core, TEF Canada or TCF Canada scores to CLB (NCLC) with IRCC’s tables. Level per skill and CRS points.';
// ISO dates compare as strings: the latest of the French, English and PTE Core table check dates.
export const TOOL_LAST_VERIFIED = [ENGLISH_LAST_VERIFIED, LAST_VERIFIED, PTE_LAST_VERIFIED].sort().at(-1);

export const TOOL_FAQ = [
  {
    q: 'What NCLC level do I need for Express Entry in French?',
    a: 'IRCC sets the minimum by program. Federal Skilled Worker: NCLC 7 in all four abilities for French as the first official language. Canadian Experience Class: NCLC 7 for TEER 0 or 1 jobs and NCLC 5 for TEER 2 or 3 jobs, in all four abilities. Federal Skilled Trades: NCLC 5 in speaking and listening and NCLC 4 in reading and writing. Check IRCC’s Express Entry language page for your program.'
  },
  {
    q: 'What CLB level do I need for Express Entry in English?',
    a: 'IRCC sets the minimum by program. Federal Skilled Worker: CLB 7 in all four abilities for English as the first official language. Canadian Experience Class: CLB 7 for TEER 0 or 1 jobs and CLB 5 for TEER 2 or 3 jobs, in all four abilities. Federal Skilled Trades: CLB 5 in speaking and listening and CLB 4 in reading and writing. Check IRCC’s Express Entry language page for your program.'
  },
  {
    q: 'Which TEF Canada score do I enter for Express Entry?',
    a: 'Use the “Équivalence ancien score” (previous score equivalency) column of your attestation de résultats. IRCC says not to enter the “Score / 699” column in an Express Entry profile because it isn’t compatible with IRCC’s system. The converter’s default TEF Canada setting uses the Express Entry scale. The “new score /699” setting uses the table IRCC publishes for other programs, such as the Start-up visa.'
  },
  {
    q: 'What is the difference between CLB and NCLC?',
    a: 'IRCC uses Canadian Language Benchmarks (CLB) for English and Niveaux de compétence linguistique canadiens (NCLC) for French. The numbered levels line up, so NCLC 7 is the French counterpart of CLB 7. This tool covers the three English tests, IELTS General Training, CELPIP-General and PTE Core, and the two French tests, TEF Canada and TCF Canada.'
  },
  {
    q: 'How do my four levels turn into CRS points?',
    a: 'IRCC awards first-official-language points for each of reading, writing, speaking and listening, and the amount depends on whether you have a spouse or common-law partner coming with you. The tool adds the four per-ability amounts from the current CRS criteria table. It does not calculate the rest of your CRS score. Separately, IRCC adds 25 or 50 extra points for French when you reach NCLC 7 in all four abilities, depending on your English results.'
  },
  {
    q: 'Which IELTS, CELPIP and PTE tests does Express Entry accept?',
    a: 'IRCC’s list of accepted tests says you must take the IELTS General Training option, the CELPIP-General test and the PTE Core option. IELTS Academic is not accepted, and neither is IELTS One Skill Retake. PTE Academic is a different test from PTE Core.'
  },
  {
    q: 'What PTE Core scores equal CLB 7 and CLB 9?',
    a: 'On IRCC’s table, CLB 7 is 68–75 in speaking, 60–70 in listening, 60–68 in reading and 69–78 in writing. CLB 9 is 84–88 in speaking, 82–88 in listening, 78–87 in reading and 88–89 in writing. PTE Core scores run from 10 to 90. Use the tables on this page for your own scores and confirm them on canada.ca.'
  },
  {
    q: 'What IELTS General Training scores equal CLB 7 and CLB 9?',
    a: 'On IRCC’s table, CLB 7 is 6.0 in speaking, listening, reading and writing. CLB 9 is 7.0 in speaking, 8.0 in listening, 7.0 in reading and 7.0 in writing. The bands differ by skill, so use the tables on this page for your own scores and confirm them on canada.ca.'
  },
  {
    q: 'What if my IELTS score falls between two scores on IRCC’s table?',
    a: 'IRCC’s table lists the score that earns each level. For example, listening is 6.0 for CLB 7 and 7.5 for CLB 8, so a listening score of 7.0 sits between them. This tool gives the highest level whose listed score you have reached, which is CLB 7 in that example. IRCC doesn’t spell this out on the page, so check your level on canada.ca before you rely on it.'
  },
  {
    q: 'Does this converter guarantee my CLB level or my CRS points?',
    a: 'No. It copies IRCC’s published tables and gives no guarantee about your result, your level or your CRS score. IRCC can change its tables at any time, and IRCC’s own assessment of your official test results is what counts.'
  },
  {
    q: 'How long are IELTS, CELPIP, PTE Core, TEF Canada and TCF Canada results valid for Express Entry?',
    a: 'IRCC requires your language test results to be less than 2 years old both when you complete your Express Entry profile and when you submit your application for permanent residence.'
  },
  {
    q: 'Is this converter official?',
    a: 'No. OpenExam Hub is independent and not affiliated with IRCC, the IELTS test owners, Paragon Testing Enterprises (CELPIP), Pearson (PTE Core), CCI Paris Île-de-France (TEF Canada) or France Éducation international (TCF Canada). The tables are copied from canada.ca and checked on the dates shown on this page. IRCC can change them at any time, so always confirm your level on canada.ca. Your result, not this tool, is what IRCC uses.'
  }
];

/** Page chrome for /tools/clb-converter. Dates stay as {placeholders}; the component fills them. */
export const TOOL_CHROME = {
  eyebrow: 'Free tool · No account needed',
  crumb: 'CLB / NCLC score converter',
  lead: 'Pick IELTS General Training, CELPIP-General, PTE Core, TEF Canada or TCF Canada, enter your four scores and see your CLB (NCLC) level for each skill, your lowest level overall, whether you meet level 7 or 9, and the CRS language points they earn. It uses IRCC’s own tables from canada.ca, checked on {ieltsDate} (IELTS and CELPIP), {pteDate} (PTE Core) and {tefDate} (TEF Canada and TCF Canada). The tool gives no score guarantees.',
  converterTitle: 'Converter',
  stepTest: '1. Pick your test',
  testLabel: 'Test',
  celpipBefore: ' See the ',
  celpipGuide: 'CELPIP guide',
  celpipAfter: ' for test format and official practice.',
  pteBefore: ' See ',
  pteLink: 'IELTS vs PTE Core',
  pteAfter: ' for the test format and the two CLB tables side by side.',
  tefScale: 'My scores are on the new “Score / 699” scale (not for Express Entry)',
  tefScaleHelp: 'For Express Entry, IRCC says to use the “Équivalence ancien score” column of your TEF Canada results instead. Leave this unticked for Express Entry.',
  stepScores: '2. Enter your four scores',
  maxPlaceholder: 'max {score}',
  addRemaining: 'Add the remaining scores to see your lowest level and the {scheme} 7 and 9 check.',
  emptyResult: 'Your level for each skill, and your lowest level overall, will show here as you type.',
  yourResult: 'Your result',
  lowest: 'Lowest level: {level}',
  lowestNote: 'IRCC looks at each ability separately, so your lowest skill sets the level you can claim for a minimum requirement.',
  meets7: 'Meets {scheme} 7 (FSW minimum)',
  meets9: 'Meets {scheme} 9',
  yes: 'yes',
  notYet: 'not yet',
  meetsYes: 'All four abilities are {scheme} {level} or higher.',
  meetsNo: 'Below {level}: {skills}.',
  below: 'Below {scheme} 4',
  top: '{scheme} 10',
  levelN: '{scheme} {n}',
  crsHeading: 'CRS points for your first official language',
  familyLabel: 'Family situation for CRS points',
  noSpouse: 'No spouse or partner',
  withSpouse: 'With spouse or partner',
  totalPoints: 'Total: {total} of {max} points',
  frenchCrs: 'First official language only. IRCC also adds {low} extra points when you reach NCLC 7 in all four French abilities and CLB 4 or lower in English (or no English test), or {strong} if you also reach CLB 5 in all four English abilities.{eligible} The rest of your CRS score (age, education, work experience…) isn’t calculated here.',
  frenchEligible: ' You reach NCLC 7 in French, so the bonus can apply to you.',
  englishCrs: 'First official language only, so these points apply when English is your first official language. The rest of your CRS score (age, education, work experience, any French bonus…) isn’t calculated here, and the tool gives no guarantee about your CRS score.',
  noCrs: 'IRCC doesn’t accept the “Score / 699” scale in Express Entry profiles, so no CRS points are shown. For Express Entry, use the “Équivalence ancien score” column of your TEF Canada results.',
  ctaMeet9: 'You’re at {scheme} 9 or higher. Keep your edge sharp.',
  ctaMeet7: 'You’re past {scheme} 7. Next stop: {scheme} 9.',
  ctaGap: 'Close the gap with a free day-by-day plan.',
  ctaComplete: 'We’ll open a free {exam} {level} plan (30 days) built from official, free material.',
  ctaIncomplete: 'Opens a free {exam} plan at {level} (30 days), built from official, free material. Enter your scores first and we’ll pick the level for you.',
  ctaButton: 'Get a free study plan to reach CLB 7/9',
  pteCtaTitle: 'Choosing between PTE Core, IELTS and CELPIP?',
  pteCtaBody: 'OpenExam Hub has no PTE Core study plan yet. See the PTE Core and IELTS General Training CLB tables and test formats side by side, from IRCC and the official test sites.',
  pteCtaButton: 'Compare IELTS and PTE Core',
  fineBefore: 'Not affiliated with IRCC. Tables checked on {date}. No score guarantees. Verify your level on ',
  fineSite: 'canada.ca',
  fineAfter: '. Nothing you type leaves your device.',
  whatTitle: 'What to enter',
  enter: [
    { strong: 'IELTS:', text: ' your General Training band for each skill, in steps of 0.5 (for example 6.0 or 6.5). Express Entry accepts IELTS General Training only, not IELTS Academic.' },
    { strong: 'CELPIP:', before: ' your CELPIP-General level for each skill, a whole number. Express Entry accepts the CELPIP-General test. For test format and official practice, see the ', href: '/exams/celpip', anchor: 'CELPIP guide', after: '.' },
    { strong: 'PTE Core:', text: ' your PTE Core score for each skill, a whole number from 10 to 90. Express Entry accepts PTE Core only, not PTE Academic.' },
    { strong: 'TEF Canada, for Express Entry:', text: ' the numbers in the “Équivalence ancien score” column of your attestation de résultats. Don’t use the “Score / 699” column.' },
    { strong: 'TCF Canada:', text: ' reading and listening are out of 699; speaking and writing are out of 20.' },
    { text: 'CLB or NCLC 10 is the top level on IRCC’s tables, so any score from its lower limit up counts as level 10.' },
    { text: 'A score below the level 4 row is reported as “Below CLB 4” or “Below NCLC 4”.' },
    { text: 'For IELTS, IRCC lists one score per level. A band between two listed scores counts at the lower level (see the questions below), so confirm your result on canada.ca.' }
  ],
  tablesTitle: 'IRCC score tables used by this tool',
  tablesLead: 'Copied from canada.ca. The TEF Canada and TCF Canada tables were last checked on {tefDate}, and the IELTS and CELPIP tables on {ieltsDate}. The PTE Core table was checked on {pteDate}. For PTE Core, TEF Canada and TCF Canada each range is the score that earns that level. For IELTS and CELPIP the table shows the score IRCC lists for each CLB level.',
  regions: {
    TEF_EXPRESS_ENTRY: 'IRCC TEF Canada table',
    TEF_NEW_699: 'IRCC TEF Canada Score /699 table',
    TCF_CANADA: 'IRCC TCF Canada table',
    IELTS_GT: 'IRCC IELTS General Training table',
    CELPIP_G: 'IRCC CELPIP-General table',
    PTE_CORE: 'IRCC PTE Core table'
  },
  captionListed: '{label}: score listed by IRCC for each {scheme} level',
  captionRange: '{label}: score ranges for each {scheme} level',
  crsSection: 'CRS points for the first official language',
  crsLead: 'Express Entry’s Comprehensive Ranking System gives points for each of the four abilities. The table below is IRCC’s current “first official language” table: points per ability, up to 128 with a spouse or common-law partner and 136 without. NCLC 7 and NCLC 9 also matter for the CRS skill-transferability factors that combine language with education or foreign work experience.',
  crsRegion: 'IRCC CRS first official language points table',
  crsCaption: 'CRS points per ability for the first official language',
  levelPer: 'Level per ability',
  withSpouseCol: 'With a spouse or partner',
  withoutCol: 'Without',
  crsLevels: ['Less than CLB 4', 'CLB 4 or 5', 'CLB 6', 'CLB 7', 'CLB 8', 'CLB 9', 'CLB 10 or more'],
  crsBothBefore: 'Have results in both English and French? The ',
  crsCalc: 'CRS language points calculator',
  crsBothAfter: ' adds IRCC’s second-official-language points and the French additional points.',
  faqTitle: 'Questions people ask',
  faqMore: 'More answers about how OpenExam Hub works:',
  faqLink: 'read the full FAQ',
  sourcesTitle: 'Sources and disclaimer',
  sources: [
    { urlKey: 'ee', label: 'IRCC: Express Entry, Language test results (IELTS General Training, CELPIP-General, PTE Core, TEF Canada “ancien score” and TCF Canada tables)' },
    { urlKey: 'pte', label: 'Pearson: PTE Core scoring (scores reported on a 10–90 scale)' },
    { urlKey: 'startup', label: 'IRCC: Start-up visa, Language testing (TEF Canada “Score / 699” table, tests after 10 December 2023)' },
    { urlKey: 'crs', label: 'IRCC: Comprehensive Ranking System (CRS) criteria (first official language points, French bonus)' }
  ],
  modifiedBefore: 'IRCC’s Express Entry language test results page was last modified on ',
  modifiedAfter: ' (the page’s modified date in its metadata when we read it). IELTS and CELPIP tables last verified on ',
  pteVerified: '; PTE Core table on ',
  tefVerified: '; TEF Canada and TCF Canada tables on ',
  sourcesTail: '. OpenExam Hub is independent and not affiliated with IRCC, the IELTS test owners, Paragon Testing Enterprises (CELPIP), Pearson (PTE Core), CCI Paris Île-de-France or France Éducation international. The tool gives no score guarantees. This tool is for information only and is not immigration advice. IRCC can change its tables and rules at any time, so verify your level and your program’s requirements on canada.ca before you apply.',
  relatedTitle: 'Related guides',
  related: [
    { href: '/exams/ielts', label: 'IELTS guide: test format, band scores and free official practice' },
    { href: '/exams/celpip', label: 'CELPIP guide: test format, CLB scores and free official practice' },
    { href: '/exams/tef-canada', label: 'TEF Canada guide: format, NCLC scores and free official practice' },
    { href: '/exams/tcf-canada', label: 'TCF Canada guide: format, timings and free official practice' },
    { href: '/tools/cefr-converter', label: 'IELTS, CELPIP, PTE Academic and TCF to CEFR level' },
    { href: '/tools/crs-language-points', label: 'CRS points for your first and second official language' },
    { href: '/compare/ielts-vs-celpip', label: 'IELTS vs CELPIP: CLB scores and test format side by side' },
    { href: '/compare/ielts-vs-pte', label: 'IELTS vs PTE Core: CLB scores and test format side by side' },
    { href: '/compare/celpip-vs-pte', label: 'CELPIP vs PTE Core: CLB scores and test format side by side' },
    { href: '/compare/tef-vs-tcf', label: 'TEF Canada vs TCF Canada: NCLC scores side by side' },
    { href: '/compare/delf-vs-tcf', label: 'DELF vs TCF: levels, validity and where each is accepted' },
    { href: '/compare/clb-equivalency-table', label: 'CLB equivalency table for all five IRCC tests (CSV download)' },
    { href: '/blog/ielts-to-clb-express-entry', label: 'IELTS to CLB for Express Entry' },
    { href: '/blog/ielts-to-cefr', label: 'IELTS to CEFR: which IELTS band matches B1, B2, C1 and C2', note: ' — CEFR is not the same scale as CLB.' },
    { href: '/blog/toefl-vs-ielts', label: 'TOEFL vs IELTS in 2026: which English test should you take?', note: ' — TOEFL is not on IRCC’s Express Entry list.' },
    { href: '/blog', label: 'Read the blog', accent: true }
  ],
  notices: {
    IELTS_GT: 'Express Entry accepts IELTS General Training only. IELTS Academic and IELTS One Skill Retake are not accepted, so enter General Training scores.',
    CELPIP_G: 'Express Entry accepts the CELPIP-General test. On IRCC’s table, a CELPIP-General level equals the CLB level.',
    PTE_CORE: 'Express Entry accepts PTE Core only. PTE Academic is a different test and is not on IRCC’s Express Entry list, so enter PTE Core scores (10 to 90).'
  }
};
