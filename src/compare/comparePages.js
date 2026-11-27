// Copy for the /compare/<slug> pages. Pure data so the prerender builds FAQPage JSON-LD from the same
// text the page shows. Every fact is taken from the sources in compareData.js; no cross-exam score
// equivalences beyond IRCC's own CLB tables.
import { IELTS_CEFR, CELPIP_CEFR, PTE_ACADEMIC_CEFR, TABLES, EQUIVALENCY_TESTS, levelSentence, CSV_PATH, SOURCE_URLS, FRENCH_DIPLOMA_ROWS, GERMAN_EXAM_ROWS } from './compareData.js';

export const COMPARE_BASE = '/compare';

const NOT_AFFILIATED = (bodies) => ({
  q: 'Is this comparison official?',
  a: `No. OpenExam Hub is independent and not affiliated with IRCC, ${bodies}. The CLB tables are copied from canada.ca and the test facts from the official test websites, checked on the date shown on this page. Rules and tables can change, so confirm on canada.ca and the test owner’s site before you book or apply.`
});

const NOT_AFFILIATED_CEFR = (bodies, where) => ({
  q: 'Is this comparison official?',
  a: `No. OpenExam Hub is independent and not affiliated with ${bodies}. The facts on this page come from ${where}, checked on the date shown on this page. Rules and lists can change, so confirm with the authority that will read your result before you book.`
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
    otherCompare: [
      { href: '/compare/ielts-vs-pte', label: 'IELTS vs PTE Core: CLB scores and test format' },
      { href: '/compare/celpip-vs-pte', label: 'CELPIP vs PTE Core: CLB scores and test format' },
      { href: '/compare/clb-equivalency-table', label: 'CLB and NCLC table for all five Express Entry tests' }
    ]
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
    otherCompare: [
      { href: '/compare/ielts-vs-celpip', label: 'IELTS vs CELPIP: CLB scores and test format' },
      { href: '/compare/celpip-vs-pte', label: 'CELPIP vs PTE Core: CLB scores and test format' },
      { href: '/compare/clb-equivalency-table', label: 'CLB and NCLC table for all five Express Entry tests' }
    ]
  },
  {
    slug: 'celpip-vs-pte',
    label: 'CELPIP vs PTE Core',
    title: 'CELPIP vs PTE Core: CLB scores and format · OpenExam Hub',
    description:
      'CELPIP-General and PTE Core side by side: IRCC’s CLB table per skill, test format and timings, and why PTE Academic is not PTE Core. Sources cited.',
    h1: 'CELPIP vs PTE Core for Canada: CLB scores and test format',
    intro: [
      'IRCC accepts CELPIP-General and PTE Core for Express Entry. It publishes a separate table for each test that shows which score earns each Canadian Language Benchmark (CLB) level. This page puts those two tables next to each other, skill by skill, with the test format from the official CELPIP and Pearson sites.',
      'PTE Core is not PTE Academic, and the numbers on this page are PTE Core scores. The page does not convert a CELPIP level into a PTE score: the two scores in a row are simply what IRCC counts as the same CLB level on each test.'
    ],
    tests: ['CELPIP_G', 'PTE_CORE'],
    tabs: [
      { href: '/tools/clb-converter?tab=celpip', label: 'Convert CELPIP-General scores to CLB' },
      { href: '/tools/clb-converter?tab=pte', label: 'Convert PTE Core scores to CLB' }
    ],
    cefr: [CELPIP_CEFR, PTE_ACADEMIC_CEFR],
    faq: [
      {
        q: 'Does Express Entry accept both CELPIP and PTE Core?',
        a: 'Yes. IRCC’s list of accepted tests says you must take the CELPIP-General test or the PTE Core option. The CELPIP LS Test and PTE Academic are not the versions IRCC lists for Express Entry.'
      },
      {
        q: 'What CELPIP and PTE Core scores equal CLB 7?',
        a: 'On IRCC’s tables, CLB 7 is CELPIP-General 7 in each of the four skills. For PTE Core it is 68–75 in speaking, 60–70 in listening, 60–68 in reading and 69–78 in writing.'
      },
      {
        q: 'What CELPIP and PTE Core scores equal CLB 9?',
        a: 'On IRCC’s tables, CLB 9 is CELPIP-General 9 in each of the four skills. For PTE Core it is 84–88 in speaking, 82–88 in listening, 78–87 in reading and 88–89 in writing.'
      },
      {
        q: 'How long are the CELPIP-General and PTE Core tests?',
        a: 'CELPIP lists Listening at 46 to 55 minutes, Reading 43 to 56 minutes, Writing 53 minutes and Speaking 15 minutes. Pearson describes PTE Core as a computer-based test of about 2 hours in three parts: Speaking & Writing 50 to 65 minutes, Reading 27 to 37 minutes and Listening 22 to 37 minutes.'
      },
      {
        q: 'Can I convert a CELPIP level into a PTE Core score?',
        a: 'This page doesn’t do that. It shows IRCC’s separate CLB table for each test side by side, so you can see which score on each test IRCC counts as the same CLB level. That is a comparison by CLB level, not a score conversion between the two tests.'
      },
      {
        q: 'Is there a CEFR table for CELPIP and PTE Core?',
        a: 'CELPIP’s chart maps CELPIP 12 to C2, 10 to 11 to C1, 7 to 9 to B2, 5 to 6 to B1, 3 to 4 to A2 and 2 to A1. Pearson’s PTE Core scoring page says PTE Core is aligned to the CLB framework; the CEFR table Pearson publishes is for PTE Academic, so this page shows it only as a PTE Academic table.'
      },
      VALIDITY_FAQ,
      NOT_AFFILIATED('Paragon Testing Enterprises (CELPIP) or Pearson (PTE)')
    ],
    guides: [
      { href: '/exams/celpip', label: 'CELPIP guide: test format, CLB scores and free official practice' },
      { href: '/exams/ielts', label: 'IELTS guide: the other English test IRCC accepts' }
    ],
    posts: [
      { href: '/blog/celpip-to-clb-express-entry', label: 'CELPIP to CLB: Express Entry scores explained' },
      { href: '/blog/english-tests-canada-fall-2027-deadlines', label: 'English tests for Canada’s fall 2027 intake: IELTS, TOEFL and the mid-January deadlines' }
    ],
    otherCompare: [
      { href: '/compare/ielts-vs-celpip', label: 'IELTS vs CELPIP: CLB scores and test format' },
      { href: '/compare/ielts-vs-pte', label: 'IELTS vs PTE Core: CLB scores and test format' },
      { href: '/compare/clb-equivalency-table', label: 'CLB and NCLC table for all five Express Entry tests' }
    ]
  },
  {
    slug: 'tef-vs-tcf',
    label: 'TEF Canada vs TCF Canada',
    title: 'TEF Canada vs TCF Canada: NCLC scores · OpenExam Hub',
    description:
      'TEF Canada and TCF Canada side by side: IRCC’s NCLC table per skill, test format and timings, which TEF score to enter, and validity. Sources cited.',
    h1: 'TEF Canada vs TCF Canada: NCLC scores and test format',
    intro: [
      'IRCC accepts two French tests for Express Entry: TEF Canada and TCF Canada. It publishes a separate table for each that shows which score earns each NCLC level (Niveaux de compétence linguistique canadiens, the French counterpart of CLB). This page puts the two tables next to each other, skill by skill, with the test format from the official TEF and TCF sites.',
      'It does not convert a TEF score into a TCF score. The two scores in a row are what IRCC counts as the same NCLC level on each test. TEF Canada numbers are on the Express Entry scale (“Équivalence ancien score”).'
    ],
    scheme: 'NCLC',
    tests: ['TEF_EXPRESS_ENTRY', 'TCF_CANADA'],
    formats: ['TEF_CANADA', 'TCF_CANADA'],
    tableNote: 'IRCC gives a score range for each level on both tests.',
    tabs: [
      { href: '/tools/clb-converter', label: 'Convert TEF Canada scores to NCLC' },
      { href: '/tools/clb-converter?tab=tcf', label: 'Convert TCF Canada scores to NCLC' }
    ],
    cefr: [],
    extraSources: [{ url: SOURCE_URLS.IRCC_CITIZENSHIP, label: 'IRCC: Citizenship language proof, step 5 (tests we accept)' }],
    faq: [
      {
        q: 'Does Express Entry accept both TEF Canada and TCF Canada?',
        a: 'Yes. IRCC’s list of accepted tests names TEF Canada and TCF Canada for French. The general TCF (tout public), DELF and DALF are not on that list.'
      },
      {
        q: 'What TEF Canada and TCF Canada scores equal NCLC 7?',
        a: `On IRCC’s tables, NCLC 7 is TEF Canada ${levelSentence('TEF_EXPRESS_ENTRY', 7)} on the Express Entry scale, and TCF Canada ${levelSentence('TCF_CANADA', 7)}.`
      },
      {
        q: 'What TEF Canada and TCF Canada scores equal NCLC 9?',
        a: `On IRCC’s tables, NCLC 9 is TEF Canada ${levelSentence('TEF_EXPRESS_ENTRY', 9)} on the Express Entry scale, and TCF Canada ${levelSentence('TCF_CANADA', 9)}.`
      },
      {
        q: 'Which TEF Canada score do I enter in my Express Entry profile?',
        a: 'The “Équivalence ancien score” column of your TEF Canada results. IRCC says not to enter the “Score / 699” column in an Express Entry profile. The tables on this page use the Express Entry scale.'
      },
      {
        q: 'How long are the TEF Canada and TCF Canada tests?',
        a: 'CCI Paris lists TEF Canada reading at 1 hour, listening 40 minutes, writing 1 hour and speaking 15 minutes. France Éducation international gives TCF Canada a total of 2 hours 47 minutes: listening 35 minutes, reading 60 minutes, writing 60 minutes and speaking 12 minutes.'
      },
      {
        q: 'Can I use TEF Canada or TCF Canada for Canadian citizenship?',
        a: 'Yes. IRCC’s citizenship language-proof page accepts TEF Canada and TCF Canada with B1 or higher in listening and speaking.'
      },
      VALIDITY_FAQ,
      NOT_AFFILIATED('CCI Paris Île-de-France (TEF Canada) or France Éducation international (TCF Canada)')
    ],
    guides: [
      { href: '/exams/tef-canada', label: 'TEF Canada guide: format, scores and free official practice' },
      { href: '/exams/tcf-canada', label: 'TCF Canada guide: format, timings and free official practice' }
    ],
    posts: [
      { href: '/blog/tef-canada-vs-tcf-canada', label: 'TEF Canada vs TCF Canada: differences and which to take' },
      { href: '/blog/tef-canada-clb-nclc-express-entry', label: 'TEF Canada scores to CLB and NCLC for Express Entry' },
      { href: '/blog/tcf-canada-clb-nclc-express-entry', label: 'TCF Canada scores to CLB and NCLC for Express Entry' },
      { href: '/blog/nclc-7-clb-7-express-entry-scores', label: 'NCLC 7 / CLB 7: what TEF Canada and TCF Canada scores you need' }
    ],
    otherCompare: [
      { href: '/compare/delf-vs-tcf', label: 'DELF vs TCF: levels, validity and who accepts each' },
      { href: '/compare/clb-equivalency-table', label: 'CLB and NCLC table for all five Express Entry tests' }
    ]
  },
  {
    slug: 'delf-vs-tcf',
    label: 'DELF vs TCF',
    title: 'DELF vs TCF: levels, validity, acceptance · OpenExam Hub',
    description:
      'DELF and DALF diplomas vs the TCF test: CEFR levels, how results work, validity, and what IRCC and the French authorities accept. Official sources only.',
    h1: 'DELF vs TCF: CEFR levels, validity and who accepts each',
    intro: [
      'The DELF and DALF are French diplomas, each awarded at one CEFR level. The TCF is a test that places you on the CEFR scale at one moment, and it comes in versions such as TCF tout public and TCF Canada. This page compares them on CEFR level, how results work, how long they count, and what Canadian and French authorities accept.',
      'There is no score conversion between a DELF and a TCF. The two are compared only by the CEFR level each one certifies, as the official pages describe them.'
    ],
    eyebrow: 'Side-by-side comparison · CEFR level only',
    checkedNote: 'Checked against French government pages, Campus France and canada.ca on',
    formats: ['DELF_DALF', 'TCF_FRENCH'],
    formatRows: FRENCH_DIPLOMA_ROWS,
    formatNote: 'From French government pages, Campus France Maroc and IRCC. France Éducation international’s own site blocked our automated checks, so fees, dates and full paper formats are not shown; check them on its site and with your exam centre.',
    tabs: [],
    cefr: [],
    extraSources: [
      { url: SOURCE_URLS.IRCC_LANGUAGE, label: 'IRCC: Express Entry, Language test results (accepted tests)' },
      { url: SOURCE_URLS.IRCC_CITIZENSHIP, label: 'IRCC: Citizenship language proof, step 5 (tests we accept)' }
    ],
    faq: [
      {
        q: 'Does a DELF expire?',
        a: 'No. The French government’s student site says a DELF is valid for life once obtained, and describes the DALF (C1 to C2) the same way. Campus France Maroc says a TCF attestation is valid for 2 years.'
      },
      {
        q: 'Can I use a DELF or DALF for Express Entry?',
        a: 'No. IRCC lists two French tests for Express Entry, TEF Canada and TCF Canada. DELF, DALF and the general TCF are not on that list.'
      },
      {
        q: 'Can I use a DELF for Canadian citizenship?',
        a: 'Yes. IRCC’s citizenship language-proof page accepts a DELF at B1 or higher and any DALF result, and TCF Canada with B1 or higher in listening and speaking.'
      },
      {
        q: 'How is a DELF marked?',
        a: 'Campus France Maroc says each DELF or DALF exam is marked out of 100, with 25 points per skill. You pass with 50/100 or more and at least 5/25 in every skill. A TCF instead gives an attestation of your level on the CEFR scale.'
      },
      {
        q: 'Which one works for French naturalisation?',
        a: 'Service-Public says naturalisation requires B2 in spoken and written French. It accepts any diploma attesting at least B2, and a TCF attestation issued less than 2 years ago by France Éducation international. DELF is not named on that page, so confirm a DELF B2 or DALF with your prefecture.'
      },
      NOT_AFFILIATED_CEFR('IRCC, France Éducation international, Campus France or the French government', 'étudiant.gouv.fr, Campus France Maroc, Service-Public and canada.ca')
    ],
    disclaimer: 'OpenExam Hub is independent and not affiliated with IRCC, France Éducation international, Campus France or the French government. This page is for information only and is not immigration advice. Rules change, so confirm with the authority that will read your result before you book.',
    guides: [
      { href: '/exams/delf', label: 'DELF and DALF guide: levels A1 to C2 and free official sample papers' },
      { href: '/exams/tcf', label: 'TCF tout public guide: format, scoring and free official practice' },
      { href: '/exams/tcf-canada', label: 'TCF Canada guide: the version IRCC accepts' }
    ],
    posts: [
      { href: '/blog/delf-vs-tcf-which-french-test', label: 'DELF vs TCF: which French test should you take?' },
      { href: '/blog/delf-dalf-express-entry', label: 'Can you use a DELF or DALF for Express Entry?' }
    ],
    otherCompare: [{ href: '/compare/tef-vs-tcf', label: 'TEF Canada vs TCF Canada: NCLC scores and test format' }]
  },
  {
    slug: 'goethe-vs-telc',
    label: 'Goethe vs telc',
    title: 'Goethe vs telc: German exams by CEFR level · OpenExam Hub',
    description:
      'Goethe-Zertifikat vs telc Deutsch by CEFR level: which certificates BAMF and DAAD name for spouse visas, naturalisation and university. Official sources only.',
    h1: 'Goethe-Zertifikat vs telc Deutsch: German exams by CEFR level',
    intro: [
      'The Goethe-Institut and telc gGmbH both run German exams at CEFR levels from A1 to C2. Authorities name certificates by level and by provider, so the useful question is which exam an authority lists for the level you need. This page lines the two up by CEFR level, using what BAMF, DAAD and telc publish.',
      'It does not convert a Goethe result into a telc result. Both certify a CEFR level; the authority that reads your certificate decides what it accepts.'
    ],
    eyebrow: 'Side-by-side comparison · CEFR level only',
    checkedNote: 'Checked against BAMF, DAAD and telc.net on',
    formats: ['GOETHE', 'TELC'],
    formatRows: GERMAN_EXAM_ROWS,
    formatNote: 'From BAMF’s leaflet and B1 list, DAAD and telc.net. The Goethe-Institut’s site blocked our automated checks, so exam timings and fees are not shown; check them on goethe.de.',
    tabs: [],
    cefr: [],
    extraSources: [
      { url: SOURCE_URLS.BAMF_SPOUSE_A1, label: 'BAMF: Proof of basic German for spousal reunification (PDF, last revised 03/2023)' },
      { url: SOURCE_URLS.BAMF_B1_LIST, label: 'BAMF: Recognised B1 language certificates (PDF, July 2023)' },
      { url: SOURCE_URLS.DAAD_GERMAN, label: 'DAAD: The German language' }
    ],
    faq: [
      {
        q: 'Which A1 certificate do I need to join my spouse in Germany?',
        a: 'BAMF’s leaflet (last revised March 2023) names “Start Deutsch 1” of the Goethe-Institut or of telc, “Grundstufe Deutsch 1” of ÖSD, and TestDaF. The German mission where you apply alone decides whether it accepts your proof.'
      },
      {
        q: 'Are Goethe and telc B1 certificates accepted for naturalisation?',
        a: 'BAMF’s list of recognised B1 proofs (dated July 2023) includes Goethe-Zertifikat B1 and several telc exams, among them Zertifikat Deutsch / telc Deutsch B1 and telc Deutsch A2-B1. BAMF says certificates from internal university or course-provider tests are not recognised.'
      },
      {
        q: 'Which one do German universities accept?',
        a: 'DAAD says the Goethe-Zertifikat C2 and telc Deutsch C1 Hochschule are usually recognised by universities, and that some programmes also recognise the Goethe-Zertifikat B2 and C1. DAAD also describes TestDaF and DSH, and says that reaching at least the intermediate level in all their parts meets the requirements of the vast majority of degree programmes. Ask your university which certificate your programme accepts.'
      },
      {
        q: 'What is a telc dual-level exam?',
        a: 'telc says its dual-level exams, such as telc Deutsch A2·B1, assess two CEFR levels, and you receive a certificate for either the lower or the higher level.'
      },
      NOT_AFFILIATED_CEFR('the Goethe-Institut, telc gGmbH, BAMF or DAAD', 'BAMF, DAAD and telc.net')
    ],
    disclaimer: 'OpenExam Hub is independent and not affiliated with the Goethe-Institut, telc gGmbH, BAMF or DAAD. This page is for information only and is not legal or immigration advice. Lists change, so confirm with the mission, authority or university that will read your certificate.',
    guides: [
      { href: '/exams/goethe', label: 'Goethe-Zertifikat guide: free official practice tests A1 to C2' },
      { href: '/exams/telc', label: 'telc guide: official practice tests and handbooks' }
    ],
    posts: [
      { href: '/blog/german-exams-visa-university-professional-recognition', label: 'Which German exam you need for a visa, university or professional recognition' },
      { href: '/blog/germany-summer-2027-uni-assist-goethe', label: 'German university summer semester 2027: Goethe, TestDaF and the uni-assist window at FH Aachen' }
    ],
    otherCompare: []
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
    { name: 'Compare tests', path: COMPARE_BASE },
    { name: page.label, path: page.path || comparePath(page) }
  ];
}

const testName = (id) => (id === 'TEF_EXPRESS_ENTRY' ? 'TEF Canada (Express Entry scale)' : TABLES[id].label);

/** /compare/clb-equivalency-table: all five IRCC tables on one page, plus a CSV of the same cells. */
export const CLB_TABLE_PAGE = {
  slug: 'clb-equivalency-table',
  path: `${COMPARE_BASE}/clb-equivalency-table`,
  label: 'CLB and NCLC equivalency table',
  title: 'CLB equivalency table for all 5 tests · OpenExam Hub',
  description:
    'IRCC’s CLB and NCLC tables for IELTS General Training, CELPIP-General, PTE Core, TEF Canada and TCF Canada on one page, per skill, with a CSV download.',
  h1: 'CLB and NCLC equivalency table: IELTS, CELPIP, PTE Core, TEF Canada and TCF Canada',
  intro: [
    'IRCC accepts five language tests for Express Entry: IELTS General Training, CELPIP-General and PTE Core for English (CLB), and TEF Canada and TCF Canada for French (NCLC). For each test it publishes a table of the score that earns each level. This page puts all five tables on one page, one table per skill.',
    'CLB and NCLC levels line up, so CLB 7 and NCLC 7 are the same benchmark in English and French. The scores in a row are what IRCC counts as that level on each test. They are not conversions between the tests.'
  ],
  tests: EQUIVALENCY_TESTS,
  csvPath: CSV_PATH,
  faq: [
    {
      q: 'What scores equal CLB 7 or NCLC 7 on each test?',
      a: `On IRCC’s tables, CLB/NCLC 7 is: ${EQUIVALENCY_TESTS.map((id) => `${testName(id)} ${levelSentence(id, 7)}`).join('; ')}.`
    },
    {
      q: 'What scores equal CLB 9 or NCLC 9 on each test?',
      a: `On IRCC’s tables, CLB/NCLC 9 is: ${EQUIVALENCY_TESTS.map((id) => `${testName(id)} ${levelSentence(id, 9)}`).join('; ')}.`
    },
    {
      q: 'Which TEF Canada score does this table use?',
      a: 'The Express Entry scale, the “Équivalence ancien score” column of the TEF Canada results. IRCC says not to enter the “Score / 699” column in an Express Entry profile. The CLB converter has a separate setting for the /699 table IRCC publishes for other programs.'
    },
    {
      q: 'Why do IELTS and CELPIP show one score per level and the others show ranges?',
      a: 'That is how IRCC prints them. For IELTS General Training and CELPIP-General, IRCC lists the score that earns each level. For PTE Core, TEF Canada and TCF Canada it lists a score range for each level.'
    },
    {
      q: 'Can I download this table?',
      a: 'Yes. The CSV file has one row per test, skill and level, with the score as IRCC prints it, the canada.ca source page and the date the table was last checked. It is free to reuse; please link back to this page and to canada.ca.'
    },
    VALIDITY_FAQ,
    NOT_AFFILIATED('the IELTS test owners, Paragon Testing Enterprises (CELPIP), Pearson (PTE), CCI Paris Île-de-France (TEF Canada) or France Éducation international (TCF Canada)')
  ]
};

/** /compare: the hub that lists every comparison page. */
export const COMPARE_HUB = {
  path: COMPARE_BASE,
  label: 'Compare tests',
  title: 'Compare language tests side by side · OpenExam Hub',
  description:
    'IRCC’s CLB and NCLC tables for the Express Entry tests side by side, plus French diplomas and German exams compared by CEFR level. Official sources only.',
  h1: 'Compare language tests side by side'
};
