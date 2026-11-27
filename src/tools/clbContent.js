// Copy for /tools/clb-converter. Pure data so the prerender can build JSON-LD from the same text the
// page shows. Every factual claim here is taken from the canada.ca pages listed in clbData.js.
import { ENGLISH_LAST_VERIFIED, LAST_VERIFIED } from './clbData.js';

export const TOOL_PATH = '/tools/clb-converter';

/** Short ?tab= slugs for the four tests. Missing or invalid values fall back to TEF (the default). */
export const DEFAULT_TOOL_MODE = 'TEF_EXPRESS_ENTRY';
export const TOOL_TABS = {
  tef: 'TEF_EXPRESS_ENTRY',
  tcf: 'TCF_CANADA',
  ielts: 'IELTS_GT',
  celpip: 'CELPIP_G'
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

export const TOOL_NAME = 'IELTS, CELPIP, TEF Canada & TCF Canada to CLB (NCLC) score converter';
export const TOOL_LABEL = 'CLB / NCLC score converter';
export const TOOL_H1 = 'IELTS, CELPIP, TEF Canada and TCF Canada to CLB (NCLC) score converter';
export const TOOL_DESCRIPTION =
  'Free converter from IELTS General Training, CELPIP-General, TEF Canada and TCF Canada scores to CLB (NCLC) levels, using IRCC’s official tables. Level per skill, level 7 or 9 check, CRS points.';
// ISO dates compare as strings: the latest of the French-table and English-table check dates.
export const TOOL_LAST_VERIFIED = ENGLISH_LAST_VERIFIED > LAST_VERIFIED ? ENGLISH_LAST_VERIFIED : LAST_VERIFIED;

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
    a: 'IRCC uses Canadian Language Benchmarks (CLB) for English and Niveaux de compétence linguistique canadiens (NCLC) for French. The numbered levels line up, so NCLC 7 is the French counterpart of CLB 7. This tool covers the two English tests, IELTS General Training and CELPIP-General, and the two French tests, TEF Canada and TCF Canada.'
  },
  {
    q: 'How do my four levels turn into CRS points?',
    a: 'IRCC awards first-official-language points for each of reading, writing, speaking and listening, and the amount depends on whether you have a spouse or common-law partner coming with you. The tool adds the four per-ability amounts from the current CRS criteria table. It does not calculate the rest of your CRS score. Separately, IRCC adds 25 or 50 extra points for French when you reach NCLC 7 in all four abilities, depending on your English results.'
  },
  {
    q: 'Which IELTS and CELPIP tests does Express Entry accept?',
    a: 'IRCC’s list of accepted tests says you must take the IELTS General Training option and the CELPIP-General test. IELTS Academic is not accepted, and neither is IELTS One Skill Retake. IRCC also accepts PTE Core, which this tool does not cover.'
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
    q: 'How long are IELTS, CELPIP, TEF Canada and TCF Canada results valid for Express Entry?',
    a: 'IRCC requires your language test results to be less than 2 years old both when you complete your Express Entry profile and when you submit your application for permanent residence.'
  },
  {
    q: 'Is this converter official?',
    a: 'No. OpenExam Hub is independent and not affiliated with IRCC, the IELTS test owners, Paragon Testing Enterprises (CELPIP), CCI Paris Île-de-France (TEF Canada) or France Éducation international (TCF Canada). The tables are copied from canada.ca and checked on the dates shown on this page. IRCC can change them at any time, so always confirm your level on canada.ca. Your result, not this tool, is what IRCC uses.'
  }
];
