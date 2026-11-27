// Copy for the /compare/<slug> pages. Pure data so the prerender builds FAQPage JSON-LD from the same
// text the page shows. Every fact is taken from the sources in compareData.js; no cross-exam score
// equivalences beyond IRCC's own CLB tables.
import { IELTS_CEFR, CELPIP_CEFR, PTE_ACADEMIC_CEFR } from './compareData.js';

export const COMPARE_BASE = '/compare';

const NOT_AFFILIATED = (bodies) => ({
  q: 'Is this comparison official?',
  a: `No. OpenExam Hub is independent and not affiliated with IRCC, ${bodies}. The CLB tables are copied from canada.ca and the test facts from the official test websites, checked on the date shown on this page. Rules and tables can change, so confirm on canada.ca and the test owner’s site before you book or apply.`
});

const VALIDITY_FAQ = {
  q: 'How long are the results valid for Express Entry?',
  a: 'IRCC requires your language test results to be less than 2 years old both when you complete your Express Entry profile and when you submit your application for permanent residence.'
};

export const COMPARE_PAGES = [
  {
    slug: 'ielts-vs-celpip',
    label: 'IELTS vs CELPIP',
    title: 'IELTS vs CELPIP: CLB scores and test format · OpenExam Hub',
    description:
      'IELTS General Training vs CELPIP-General: IRCC’s CLB table per skill, test format and timings, and the CEFR chart each test publishes. Sources cited.',
    h1: 'IELTS vs CELPIP for Canada: CLB scores and test format',
    intro: [
      'IRCC accepts both IELTS General Training and CELPIP-General for Express Entry. It publishes a separate table for each test that shows which score earns each Canadian Language Benchmark (CLB) level. This page puts those two tables next to each other, skill by skill, with the test format from the official IELTS and CELPIP sites.',
      'It does not convert an IELTS band into a CELPIP level. The two scores in a row are simply what IRCC counts as the same CLB level on each test.'
    ],
    tests: ['IELTS_GT', 'CELPIP_G'],
    tabs: [
      { href: '/tools/clb-converter?tab=ielts', label: 'Convert IELTS General Training scores to CLB' },
      { href: '/tools/clb-converter?tab=celpip', label: 'Convert CELPIP-General scores to CLB' }
    ],
    cefr: [IELTS_CEFR, CELPIP_CEFR],
    faq: [
      {
        q: 'Does Express Entry accept both IELTS and CELPIP?',
        a: 'Yes. IRCC’s list of accepted tests says you must take the IELTS General Training option or the CELPIP-General test. IELTS Academic is not accepted, and neither is IELTS One Skill Retake.'
      },
      {
        q: 'What IELTS and CELPIP scores equal CLB 7?',
        a: 'On IRCC’s tables, CLB 7 is IELTS General Training 6.0 in speaking, listening, reading and writing, and CELPIP-General 7 in each of the four skills. On IRCC’s CELPIP table the CELPIP-General level equals the CLB level.'
      },
      {
        q: 'What IELTS and CELPIP scores equal CLB 9?',
        a: 'On IRCC’s tables, CLB 9 is IELTS General Training 7.0 in speaking, 8.0 in listening, 7.0 in reading and 7.0 in writing, and CELPIP-General 9 in each of the four skills.'
      },
      {
        q: 'How long are the IELTS General Training and CELPIP tests?',
        a: 'IELTS lists Listening at about 30 minutes plus 10 minutes to transfer answers to an answer sheet, Reading 60 minutes, Writing 60 minutes and Speaking 11 to 14 minutes. CELPIP lists Listening at 46 to 55 minutes, Reading 43 to 56 minutes, Writing 53 minutes and Speaking 15 minutes.'
      },
      {
        q: 'Can I convert an IELTS band into a CELPIP level?',
        a: 'This page doesn’t do that. It shows IRCC’s separate CLB table for each test side by side, so you can see which score on each test IRCC counts as the same CLB level. That is a comparison by CLB level, not a score conversion between the two tests.'
      },
      {
        q: 'How do IELTS and CELPIP relate to CEFR levels?',
        a: 'Each test owner publishes its own CEFR alignment. IELTS says overall bands 5.5 to 6.5 are equivalent to B2, bands 7 to 8 correspond to C1, and C2 corresponds approximately to band 9. CELPIP’s chart maps CELPIP 12 to C2, 10 to 11 to C1, 7 to 9 to B2, 5 to 6 to B1, 3 to 4 to A2 and 2 to A1. CEFR is not the scale IRCC uses for Express Entry; IRCC uses CLB.'
      },
      VALIDITY_FAQ,
      NOT_AFFILIATED('the IELTS test owners or Paragon Testing Enterprises (CELPIP)')
    ],
    guides: [
      { href: '/exams/ielts', label: 'IELTS guide: test format, band scores and free official practice' },
      { href: '/exams/celpip', label: 'CELPIP guide: test format, CLB scores and free official practice' }
    ],
    posts: [
      { href: '/blog/ielts-to-clb-express-entry', label: 'IELTS to CLB for Express Entry' },
      { href: '/blog/celpip-to-clb-express-entry', label: 'CELPIP to CLB: Express Entry scores explained' },
      { href: '/blog/ielts-for-express-entry-academic-or-general', label: 'IELTS Academic or General Training: which one you need for Express Entry' },
      { href: '/blog/ielts-to-cefr', label: 'IELTS to CEFR: which IELTS band matches B1, B2, C1 and C2' }
    ],
    otherCompare: [{ href: '/compare/ielts-vs-pte', label: 'IELTS vs PTE Core: CLB scores and test format' }]
  },
  {
    slug: 'ielts-vs-pte',
    label: 'IELTS vs PTE Core',
    title: 'IELTS vs PTE Core: CLB scores and test format · OpenExam Hub',
    description:
      'IELTS General Training and PTE Core side by side: IRCC’s CLB table for each skill, test format and timings, and why PTE Academic is not PTE Core. Sources cited.',
    h1: 'IELTS vs PTE Core for Canada: CLB scores and test format',
    intro: [
      'IRCC accepts IELTS General Training and PTE Core for Express Entry. It publishes a separate table for each test that shows which score earns each Canadian Language Benchmark (CLB) level. This page puts those two tables next to each other, skill by skill, with the test format from the official IELTS and Pearson sites.',
      'PTE Core is not PTE Academic. IRCC says you must take the PTE Core option, and the numbers on this page are PTE Core scores. The page does not convert an IELTS band into a PTE score: the two scores in a row are simply what IRCC counts as the same CLB level on each test.'
    ],
    tests: ['IELTS_GT', 'PTE_CORE'],
    tabs: [
      { href: '/tools/clb-converter?tab=ielts', label: 'Convert IELTS General Training scores to CLB' },
      { href: '/tools/clb-converter?tab=pte', label: 'Convert PTE Core scores to CLB' }
    ],
    cefr: [IELTS_CEFR, PTE_ACADEMIC_CEFR],
    faq: [
      {
        q: 'Does Express Entry accept PTE Academic?',
        a: 'No. IRCC’s list of accepted tests says you must take the PTE Core option, and for IELTS the General Training option. PTE Academic and PTE Core are different Pearson tests.'
      },
      {
        q: 'What IELTS and PTE Core scores equal CLB 7?',
        a: 'On IRCC’s tables, CLB 7 is IELTS General Training 6.0 in speaking, listening, reading and writing. For PTE Core it is 68–75 in speaking, 60–70 in listening, 60–68 in reading and 69–78 in writing.'
      },
      {
        q: 'What IELTS and PTE Core scores equal CLB 9?',
        a: 'On IRCC’s tables, CLB 9 is IELTS General Training 7.0 in speaking, 8.0 in listening, 7.0 in reading and 7.0 in writing. For PTE Core it is 84–88 in speaking, 82–88 in listening, 78–87 in reading and 88–89 in writing.'
      },
      {
        q: 'How long are the IELTS General Training and PTE Core tests?',
        a: 'IELTS lists Listening at about 30 minutes plus 10 minutes to transfer answers to an answer sheet, Reading 60 minutes, Writing 60 minutes and Speaking 11 to 14 minutes. Pearson describes PTE Core as a computer-based test of about 2 hours in three parts: Speaking & Writing 50 to 65 minutes, Reading 27 to 37 minutes and Listening 22 to 37 minutes.'
      },
      {
        q: 'Is there a CEFR table for PTE Core?',
        a: 'Pearson’s PTE Core scoring page says PTE Core scores are aligned to the CLB framework. The CEFR table Pearson publishes on its scoring pages is for PTE Academic (85–90 C2, 76–84 C1, 59–75 B2, 43–58 B1, 30–42 A2, 10–29 A1), so this page shows it only as a PTE Academic table and gives no CEFR level for PTE Core scores.'
      },
      {
        q: 'Can I convert an IELTS band into a PTE Core score?',
        a: 'This page doesn’t do that. It shows IRCC’s separate CLB table for each test side by side, so you can see which score on each test IRCC counts as the same CLB level. That is a comparison by CLB level, not a score conversion between the two tests.'
      },
      VALIDITY_FAQ,
      NOT_AFFILIATED('the IELTS test owners or Pearson (PTE)')
    ],
    guides: [
      { href: '/exams/ielts', label: 'IELTS guide: test format, band scores and free official practice' },
      { href: '/exams/celpip', label: 'CELPIP guide: the other English test IRCC accepts' }
    ],
    posts: [
      { href: '/blog/ielts-to-clb-express-entry', label: 'IELTS to CLB for Express Entry' },
      { href: '/blog/ielts-for-express-entry-academic-or-general', label: 'IELTS Academic or General Training: which one you need for Express Entry' },
      { href: '/blog/celpip-to-clb-express-entry', label: 'CELPIP to CLB: Express Entry scores explained' },
      { href: '/blog/english-tests-canada-fall-2027-deadlines', label: 'English tests for Canada’s fall 2027 intake: IELTS, TOEFL and the mid-January deadlines' }
    ],
    otherCompare: [{ href: '/compare/ielts-vs-celpip', label: 'IELTS vs CELPIP: CLB scores and test format' }]
  }
];

export function comparePath(page) {
  return `${COMPARE_BASE}/${page.slug}`;
}

export function comparePageBySlug(slug) {
  return COMPARE_PAGES.find((p) => p.slug === slug) || null;
}

export function compareBreadcrumbs(page) {
  return [
    { name: 'Home', path: '/' },
    { name: page.label, path: comparePath(page) }
  ];
}
