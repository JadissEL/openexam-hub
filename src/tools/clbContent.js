// Copy for /tools/clb-converter. Pure data so the prerender can build JSON-LD from the same text the
// page shows. Every factual claim here is taken from the canada.ca pages listed in clbData.js.
import { LAST_VERIFIED } from './clbData.js';

export const TOOL_PATH = '/tools/clb-converter';
export const TOOL_NAME = 'TEF Canada & TCF Canada to CLB (NCLC) score converter';
export const TOOL_LABEL = 'NCLC score converter';
export const TOOL_H1 = 'TEF Canada and TCF Canada to CLB (NCLC) score converter';
export const TOOL_DESCRIPTION =
  'Free converter from TEF Canada and TCF Canada scores to NCLC (CLB) levels, using IRCC’s official tables. See your level per skill, whether you meet NCLC 7 or 9, and your CRS language points.';
export const TOOL_LAST_VERIFIED = LAST_VERIFIED;

export const TOOL_FAQ = [
  {
    q: 'What NCLC level do I need for Express Entry in French?',
    a: 'IRCC sets the minimum by program. Federal Skilled Worker: NCLC 7 in all four abilities for French as the first official language. Canadian Experience Class: NCLC 7 for TEER 0 or 1 jobs and NCLC 5 for TEER 2 or 3 jobs, in all four abilities. Federal Skilled Trades: NCLC 5 in speaking and listening and NCLC 4 in reading and writing. Check IRCC’s Express Entry language page for your program.'
  },
  {
    q: 'Which TEF Canada score do I enter for Express Entry?',
    a: 'Use the “Équivalence ancien score” (previous score equivalency) column of your attestation de résultats. IRCC says not to enter the “Score / 699” column in an Express Entry profile because it isn’t compatible with IRCC’s system. The converter’s default TEF Canada setting uses the Express Entry scale. The “new score /699” setting uses the table IRCC publishes for other programs, such as the Start-up visa.'
  },
  {
    q: 'What is the difference between CLB and NCLC?',
    a: 'IRCC uses Canadian Language Benchmarks (CLB) for English and Niveaux de compétence linguistique canadiens (NCLC) for French. The numbered levels line up, so NCLC 7 is the French counterpart of CLB 7. This tool only covers the two French tests, TEF Canada and TCF Canada.'
  },
  {
    q: 'How do my four levels turn into CRS points?',
    a: 'IRCC awards first-official-language points for each of reading, writing, speaking and listening, and the amount depends on whether you have a spouse or common-law partner coming with you. The tool adds the four per-ability amounts from the current CRS criteria table. It does not calculate the rest of your CRS score. Separately, IRCC adds 25 or 50 extra points for French when you reach NCLC 7 in all four abilities, depending on your English results.'
  },
  {
    q: 'How long are TEF Canada and TCF Canada results valid for Express Entry?',
    a: 'IRCC requires your language test results to be less than 2 years old both when you complete your Express Entry profile and when you submit your application for permanent residence.'
  },
  {
    q: 'Is this converter official?',
    a: 'No. OpenExam Hub is independent and not affiliated with IRCC, CCI Paris Île-de-France (TEF Canada) or France Éducation international (TCF Canada). The tables are copied from canada.ca and checked on the date shown on this page. IRCC can change them at any time, so always confirm your level on canada.ca. Your result, not this tool, is what IRCC uses.'
  }
];
