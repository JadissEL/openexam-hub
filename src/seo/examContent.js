/**
 * Body content for the /exams/<slug> guide pages.
 *
 * Every fact here comes from an official page that the page itself cites:
 * - formats, timings and scoring: the sourced blueprints in lib/exams.js (officialProfile), or the
 *   official page named next to the hand-written sections below;
 * - resource lists: scripts/seed-candidates.json, the link-checked seed of the in-app library.
 * No pass rates, no score promises, no testimonials.
 */
import { officialProfile, LEVELS } from '../../lib/exams.js';
import seed from '../../scripts/seed-candidates.json';
import { EXAM_PAGES, examPageBySlug } from './site.js';

const IRCC_LANGUAGE_TESTS =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html';
const IELTS_ACADEMIC = 'https://ielts.org/take-a-test/test-types/ielts-academic-test';
const IELTS_GENERAL = 'https://ielts.org/take-a-test/test-types/ielts-general-training-test';
const DELF_DALF_CA = 'https://delf-dalf.ambafrance-ca.org/fr/delf-dalf-tout-public';

const NOT_AFFILIATED = (bodies) => ({
  q: `Is OpenExam Hub affiliated with ${bodies}?`,
  a: `No. OpenExam Hub is an independent, free project. It is not affiliated with, endorsed by or sponsored by ${bodies}. It only links to material they publish for free.`
});

const CATEGORY_ORDER = ['Official exam info', 'Practice tests', 'Sample tests', 'Self-study', 'Oral comprehension'];
const CATEGORY_LABEL = {
  'Official exam info': 'Official exam information',
  'Practice tests': 'Free official practice',
  'Sample tests': 'Official sample papers',
  'Self-study': 'Free self-study',
  'Oral comprehension': 'Listening practice'
};

function resourcesFor(examIds, { include = null } = {}) {
  const rows = seed.filter((r) => examIds.includes(r.exam) && (!include || include(r)));
  const groups = [];
  for (const cat of CATEGORY_ORDER) {
    const items = rows.filter((r) => r.category === cat).map((r) => ({
      title: r.title,
      url: r.url,
      org: r.source_org,
      levels: r.levels || []
    }));
    if (items.length) groups.push({ category: CATEGORY_LABEL[cat] || cat, items });
  }
  const checked = rows.map((r) => String(r.verified_at || '').slice(0, 10)).filter(Boolean).sort().pop() || null;
  return { groups, checked };
}

function formatMinutes(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function profileTable(profile) {
  if (!profile) return null;
  return {
    sections: profile.sections.map((s) => ({
      name: s.name,
      duration: formatMinutes(s.durationMinutes),
      items: s.questionCount ?? '—',
      description: s.description
    })),
    scoring: profile.scoring,
    notes: profile.notes,
    sourceUrl: profile.sourceUrl
  };
}

function deleLevelTable() {
  const rows = LEVELS.map((level) => {
    const p = officialProfile('DELE', { level });
    const total = p.sections.reduce((n, s) => n + (s.durationMinutes || 0), 0);
    return {
      level,
      papers: p.sections.length,
      sections: p.sections.map((s) => `${s.name} (${formatMinutes(s.durationMinutes)})`),
      total: formatMinutes(total),
      sourceUrl: p.sourceUrl
    };
  });
  return rows;
}

const CONTENT = {
  'tef-canada': () => {
    const profile = officialProfile('TEF_CANADA');
    return {
      h1: 'TEF Canada: format, scores and free official practice',
      runBy: { name: 'CCI Paris Île-de-France / Le français des affaires', url: 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/presentation/' },
      intro: [
        'TEF Canada (Test d’évaluation de français) is the French test run by CCI Paris Île-de-France through Le français des affaires. Immigration, Refugees and Citizenship Canada (IRCC) accepts it as proof of French for Express Entry and other immigration programmes, and for Canadian citizenship.',
        'This page sums up the official format and links to the free preparation material that CCI Paris publishes itself: sample papers for all four tests, the listening audio, and the score tables.'
      ],
      facts: [
        ['Run by', 'CCI Paris Île-de-France / Le français des affaires'],
        ['Used for', 'Canadian immigration (Express Entry and other IRCC programmes) and citizenship'],
        ['Tests', 'Reading, listening, writing and speaking, each scored separately'],
        ['Scores', 'Converted to NCLC levels with the official TEF–NCLC correspondence table'],
        ['Validity', 'Results certificate valid for 2 years from the date of issue']
      ],
      format: profileTable(profile),
      examIds: ['TEF_CANADA'],
      planner: { exam: 'TEF_CANADA', label: 'TEF Canada' },
      faq: [
        {
          q: 'Is TEF Canada accepted for Express Entry?',
          a: 'Yes. IRCC lists TEF Canada as an approved French test for Express Entry. Each test score is converted to an NCLC level with the official correspondence table published by CCI Paris.'
        },
        {
          q: 'Do I have to take all four TEF Canada tests?',
          a: 'For an immigration application, all four tests are compulsory and must be taken on the same day. For a Canadian citizenship application, only listening and speaking are required.'
        },
        {
          q: 'How long are TEF Canada results valid?',
          a: 'CCI Paris states that the results certificate is valid for 2 years from the date of issue.'
        },
        NOT_AFFILIATED('CCI Paris Île-de-France, Le français des affaires or IRCC')
      ],
      sources: [
        { title: 'TEF Canada: official presentation (Le français des affaires)', url: profile.sourceUrl },
        { title: 'IRCC: Express Entry language test results', url: IRCC_LANGUAGE_TESTS }
      ],
      related: ['tcf-canada', 'tcf', 'delf']
    };
  },

  'tcf-canada': () => {
    const profile = officialProfile('TCF', { variant: 'canada' });
    return {
      h1: 'TCF Canada: format, timings and free official practice',
      runBy: { name: 'France Éducation international', url: profile.sourceUrl },
      intro: [
        'TCF Canada is the version of the Test de connaissance du français that France Éducation international runs for Canadian economic immigration and citizenship applications with IRCC. It is not the same test as TCF tout public: all four papers are compulsory and there is no language-structures paper.',
        'Below is the official format, then the free practice material that France Éducation international points candidates to, including the TV5Monde TCF simulator and RFI listening practice.'
      ],
      facts: [
        ['Run by', 'France Éducation international'],
        ['Used for', 'Canadian economic immigration and citizenship (IRCC)'],
        ['Papers', 'Four compulsory papers: listening, reading, writing, speaking'],
        ['Total time', '2 h 47 min'],
        ['Scores', 'Each paper scored separately; no overall average']
      ],
      format: profileTable(profile),
      examIds: ['TCF'],
      planner: { exam: 'TCF', label: 'TCF' },
      faq: [
        {
          q: 'How is TCF Canada different from TCF tout public?',
          a: 'TCF Canada has four compulsory papers (listening, reading, writing and speaking) and no language-structures paper. TCF tout public has three compulsory multiple-choice papers, including language structures, and two optional papers for writing and speaking.'
        },
        {
          q: 'How long is the TCF Canada?',
          a: 'France Éducation international gives a total of 2 hours 47 minutes for the four compulsory papers: listening 35 minutes, reading 60 minutes, writing 60 minutes and speaking 12 minutes.'
        },
        {
          q: 'Does IRCC accept TCF Canada?',
          a: 'Yes. IRCC lists TCF Canada as an approved French test for Express Entry. Check the IRCC page for the current rules before you book.'
        },
        NOT_AFFILIATED('France Éducation international or IRCC')
      ],
      sources: [
        { title: 'TCF Canada: France Éducation international', url: profile.sourceUrl },
        { title: 'IRCC: Express Entry language test results', url: IRCC_LANGUAGE_TESTS }
      ],
      related: ['tef-canada', 'tcf', 'delf']
    };
  },

  tcf: () => {
    const profile = officialProfile('TCF', { variant: 'tout_public' });
    return {
      h1: 'TCF tout public: format, scoring and free official practice',
      runBy: { name: 'France Éducation international', url: profile.sourceUrl },
      intro: [
        'The TCF tout public (Test de connaissance du français) is France Éducation international’s general French test. It reports your level on the CEFR scale, from below A1 to C2, for study, work or personal purposes.',
        'For Canadian immigration, France Éducation international runs a different version, TCF Canada, which has its own guide.'
      ],
      facts: [
        ['Run by', 'France Éducation international'],
        ['Compulsory papers', 'Listening, language structures, reading: 1 h 25 min in total'],
        ['Optional papers', 'Writing (60 min) and speaking (12 min)'],
        ['Scores', 'Each paper reported as a CEFR level, below A1 to C2']
      ],
      format: profileTable(profile),
      examIds: ['TCF'],
      planner: { exam: 'TCF', label: 'TCF' },
      faq: [
        {
          q: 'How is the TCF tout public scored?',
          a: 'Each paper gets its own score, reported as a CEFR level from below A1 to C2. The overall score of the compulsory papers is not a simple average, and the optional writing and speaking scores are reported separately.'
        },
        {
          q: 'Can I use the TCF tout public for Canadian immigration?',
          a: 'IRCC’s list of approved French tests names TCF Canada, which is a separate version of the test. See the TCF Canada guide and the IRCC page.'
        },
        NOT_AFFILIATED('France Éducation international')
      ],
      sources: [
        { title: 'TCF tout public: France Éducation international', url: profile.sourceUrl },
        { title: 'IRCC: Express Entry language test results', url: IRCC_LANGUAGE_TESTS }
      ],
      related: ['tcf-canada', 'delf', 'tef-canada']
    };
  },

  ielts: () => ({
    h1: 'IELTS: test format, band scores and free official practice tests',
    runBy: { name: 'IELTS (British Council, IDP and Cambridge University Press & Assessment)', url: IELTS_ACADEMIC },
    intro: [
      'IELTS comes in two versions. IELTS Academic is for undergraduate or postgraduate study. IELTS General Training is for migrating to an English-speaking country, such as Australia, Canada, New Zealand or the UK, or for training or study below degree level.',
      'Listening and Speaking are the same in both versions; Reading and Writing differ. The free official practice below comes from the British Council, IELTS.org and Cambridge.'
    ],
    facts: [
      ['Versions', 'IELTS Academic and IELTS General Training'],
      ['Sections', 'Listening, Reading, Writing, Speaking'],
      ['Total time', '2 h 45 min'],
      ['Scores', 'Bands from 0 to 9'],
      ['CEFR alignment', 'Approximate official alignment: 4.0–4.5 = B1, 5.5–6.0 = B2, 7.0–7.5 = C1, 8.5–9.0 = C2. Bands 5.0, 6.5 and 8.0 sit on the border between two levels']
    ],
    format: {
      sections: [
        { name: 'Listening', duration: 'about 30 min', items: '—', description: 'Same in Academic and General Training.' },
        { name: 'Reading', duration: '60 min', items: '—', description: 'Including transfer time. Different texts in Academic and General Training.' },
        { name: 'Writing', duration: '60 min', items: '—', description: 'Different tasks in Academic and General Training.' },
        { name: 'Speaking', duration: '11–14 min', items: '—', description: 'Same in Academic and General Training.' }
      ],
      scoring: 'Results are reported in bands from 0 to 9. OpenExam Hub maps a target band to a CEFR level using the IELTS–CEFR alignment published by IELTS.',
      notes: 'IELTS Academic can be taken at a test centre or online; the format is the same wherever it is taken.',
      sourceUrl: IELTS_ACADEMIC
    },
    examIds: ['IELTS'],
    planner: { exam: 'IELTS', label: 'IELTS' },
    faq: [
      {
        q: 'Should I take IELTS Academic or General Training?',
        a: 'IELTS says to choose Academic for undergraduate or postgraduate study, and General Training to migrate to an English-speaking country or to train or study below degree level. Always check what your university or immigration programme asks for.'
      },
      {
        q: 'How long is the IELTS test?',
        a: 'About 2 hours 45 minutes: Listening about 30 minutes, Reading 60 minutes, Writing 60 minutes and Speaking 11 to 14 minutes.'
      },
      {
        q: 'Which IELTS band matches CEFR B2?',
        a: 'IELTS publishes an approximate alignment, not a one-to-one match. On that figure, overall bands 5.5 and 6.0 correspond to B2, 7.0 and 7.5 to C1, and 8.5 and 9.0 to C2. Bands 5.0, 6.5 and 8.0 are borderline (5.0 between B1 and B2, 6.5 between B2 and C1, 8.0 between C1 and C2).'
      },
      NOT_AFFILIATED('IELTS, the British Council, IDP or Cambridge University Press & Assessment')
    ],
    sources: [
      { title: 'IELTS Academic test (IELTS.org)', url: IELTS_ACADEMIC },
      { title: 'IELTS General Training test (IELTS.org)', url: IELTS_GENERAL },
      { title: 'IELTS and the CEFR (IELTS.org)', url: 'https://ielts.org/organisations/ielts-for-organisations/compare-ielts/ielts-and-the-cefr' }
    ],
    related: ['toefl', 'celpip', 'tef-canada', 'tcf-canada']
  }),

  toefl: () => {
    const profile = officialProfile('TOEFL');
    return {
      h1: 'TOEFL iBT (2026 format): sections and free official practice',
      runBy: { name: 'ETS', url: 'https://www.ets.org/toefl/test-takers/ibt/about.html' },
      intro: [
        'The TOEFL iBT is the English test run by ETS, mostly used for university admission. ETS updated the test from 21 January 2026: the sections now run Reading, Listening, Writing, Speaking, and Reading and Listening are multistage adaptive.',
        'ETS publishes free official preparation: a sample test for the January 2026 edition, two full-length practice tests and the scoring rubrics for Writing and Speaking.'
      ],
      facts: [
        ['Run by', 'ETS'],
        ['Section order', 'Reading, Listening, Writing, Speaking'],
        ['Total time', 'About 2 hours'],
        ['Adaptive', 'Reading and Listening are multistage adaptive; Writing and Speaking are linear'],
        ['Scores', 'Reported by ETS on the TOEFL scale']
      ],
      format: profileTable(profile),
      examIds: ['TOEFL'],
      planner: { exam: 'TOEFL', label: 'TOEFL' },
      faq: [
        {
          q: 'What changed in the TOEFL iBT on 21 January 2026?',
          a: 'ETS changed the section order to Reading, Listening, Writing and Speaking, made Reading and Listening multistage adaptive, and introduced new task types such as Complete the Words, Build a Sentence and Take an Interview. The test takes about two hours.'
        },
        {
          q: 'Are there free official TOEFL practice tests?',
          a: 'Yes. ETS publishes a free sample test for the January 2026 edition, two full-length practice tests as PDFs, and the official Writing and Speaking rubrics. They are linked on this page.'
        },
        NOT_AFFILIATED('ETS')
      ],
      sources: [
        { title: 'ETS: Updated TOEFL iBT test overview (PDF)', url: profile.sourceUrl },
        { title: 'ETS: TOEFL iBT test content', url: 'https://www.ets.org/toefl/test-takers/ibt/about/content.html' }
      ],
      related: ['ielts', 'celpip', 'dele', 'goethe']
    };
  },


  celpip: () => {
    const profile = officialProfile('CELPIP');
    const CELPIP_FORMAT = 'https://www.celpip.ca/test-format-scoring/';
    return {
      h1: 'CELPIP: test format, CLB scores and free official practice',
      runBy: { name: 'Paragon Testing Enterprises (CELPIP)', url: CELPIP_FORMAT },
      intro: [
        'The Canadian English Language Proficiency Index Program (CELPIP) is a general English language proficiency test run by Paragon Testing Enterprises. The CELPIP Test assesses listening, reading, writing and speaking. The CELPIP LS Test assesses only listening and speaking.',
        'IRCC accepts the CELPIP-General test for Express Entry. On Paragon’s official chart, CELPIP levels correspond to Canadian Language Benchmarks (CLB) and to CEFR levels. Free official format information and IRCC’s conversion table are linked below.'
      ],
      facts: [
        ['Run by', 'Paragon Testing Enterprises'],
        ['Tests', 'CELPIP Test (four skills) and CELPIP LS (listening and speaking)'],
        ['Skills (CELPIP Test)', 'Listening, Reading, Writing, Speaking'],
        ['Scores', 'CELPIP levels 0–12, mapped to CLB and CEFR on the official chart'],
        ['Validity', 'Two years from the date the score report is issued']
      ],
      format: {
        sections: [
          { name: 'Listening', duration: '46–55 min', items: '—', description: 'Six parts: Listening to Problem Solving; Listening to a Daily Life Conversation; Listening for Information; Listening to a News Item; Listening to a Discussion; Listening to Viewpoints. Includes unscored items used for test development.' },
          { name: 'Reading', duration: '43–56 min', items: '—', description: 'Four parts: Reading Correspondence; Reading to Apply a Diagram; Reading for Information; Reading for Viewpoints. Includes unscored items used for test development.' },
          { name: 'Writing', duration: '53 min', items: '2 tasks', description: 'Task 1: Writing an Email. Task 2: Responding to Survey Questions.' },
          { name: 'Speaking', duration: '15 min', items: '8 tasks', description: 'Eight tasks: Giving Advice; Talking about a Personal Experience; Describing a Scene; Making Predictions; Comparing and Persuading; Dealing with a Difficult Situation; Expressing Opinions; Describing an Unusual Situation.' }
        ],
        scoring: profile.scoring,
        notes: profile.notes,
        sourceUrl: CELPIP_FORMAT
      },
      examIds: ['CELPIP'],
      planner: { exam: 'CELPIP', label: 'CELPIP' },
      faq: [
        {
          q: 'What is the difference between the CELPIP Test and CELPIP LS?',
          a: 'Paragon’s Test Format & Scoring page says the CELPIP Test assesses listening, reading, writing and speaking, while the CELPIP LS Test assesses only listening and speaking.'
        },
        {
          q: 'How do CELPIP levels correspond to CLB and CEFR?',
          a: 'On Paragon’s official chart, from CELPIP 4 to 12 the CELPIP level equals the CLB level (CELPIP 2 maps to CLB 1 and 2). The same chart maps CELPIP 12 to CEFR C2, 10–11 to C1, 7–9 to B2, 5–6 to B1, 3–4 to A2, and 2 to A1. IRCC’s Express Entry table also treats a CELPIP-General level as the CLB level for immigration scoring. Always confirm the current tables on celpip.ca and canada.ca.'
        },
        {
          q: 'Does Express Entry accept CELPIP?',
          a: 'IRCC’s list of accepted tests says you must take the CELPIP-General test. This page does not replace IRCC’s rules; check canada.ca for the programme you are applying to.'
        },
        NOT_AFFILIATED('Paragon Testing Enterprises (CELPIP) or IRCC')
      ],
      sources: [
        { title: 'CELPIP: Test Format & Scoring', url: CELPIP_FORMAT },
        { title: 'IRCC: Express Entry language tests', url: IRCC_LANGUAGE_TESTS }
      ],
      related: ['ielts', 'toefl', 'tef-canada', 'tcf-canada']
    };
  },

  delf: () => ({
    h1: 'DELF and DALF: levels A1 to C2 and free official sample papers',
    runBy: { name: 'France Éducation international', url: DELF_DALF_CA },
    intro: [
      'DELF (Diplôme d’études en langue française) and DALF (Diplôme approfondi de langue française) are the official French diplomas of France Éducation international. DELF tout public covers levels A1 to B2; DALF covers C1 and C2. Both assess reading, listening, writing and speaking.',
      'Personalised DELF and DALF study plans are coming soon. In the meantime, the free official sample papers and listening practice are listed below, and you can build a TCF plan — it uses many of the same official French sources.'
    ],
    facts: [
      ['Awarded by', 'France Éducation international'],
      ['DELF levels', 'A1, A2, B1, B2'],
      ['DALF levels', 'C1, C2'],
      ['Skills', 'Written and oral comprehension and expression']
    ],
    format: null,
    examIds: ['DELF', 'DALF'],
    planner: null,
    relatedPlanner: { exam: 'TCF', label: 'TCF' },
    faq: [
      {
        q: 'What is the difference between DELF and DALF?',
        a: 'DELF covers CEFR levels A1 to B2. DALF is for advanced learners and covers C1 and C2. Both assess written and oral comprehension and expression.'
      },
      {
        q: 'Can OpenExam Hub make a DELF study plan?',
        a: 'Personalised DELF and DALF plans are coming soon. The official sample papers below are free to use now. Until those plans are ready, you can build a TCF plan, which uses many of the same official French sources.'
      },
      NOT_AFFILIATED('France Éducation international')
    ],
    sources: [{ title: 'DELF DALF tout public (DELF-DALF Canada, France Éducation international)', url: DELF_DALF_CA }],
    related: ['tcf', 'tcf-canada', 'tef-canada']
  }),

  goethe: () => ({
    h1: 'Goethe-Zertifikat A1 to C2: free official practice tests',
    runBy: { name: 'Goethe-Institut', url: 'https://www.goethe.de/de/spr/prf.html' },
    intro: [
      'The Goethe-Zertifikat exams are the German exams of the Goethe-Institut, from A1 to C2. Each level tests reading, listening, writing and speaking.',
      'The Goethe-Institut publishes free official practice material (Übungssätze) for every level, including accessible versions. Free self-study from DW and the VHS Lernportal is listed too.'
    ],
    facts: [
      ['Run by', 'Goethe-Institut'],
      ['Levels', 'A1, A2, B1, B2, C1, C2'],
      ['Skills', 'Reading, listening, writing, speaking'],
      ['Official practice', 'Free practice sets for every level on goethe.de']
    ],
    format: null,
    examIds: ['GOETHE'],
    planner: { exam: 'GOETHE', label: 'Goethe' },
    faq: [
      {
        q: 'Where can I find official Goethe-Zertifikat practice tests?',
        a: 'On the Goethe-Institut’s Prüfungstrainings page, which has free official practice material for every level from A1 to C2, plus accessible versions. Each level is linked on this page.'
      },
      NOT_AFFILIATED('the Goethe-Institut')
    ],
    sources: [{ title: 'Goethe-Institut: German exams', url: 'https://www.goethe.de/de/spr/prf.html' }],
    related: ['dele', 'toefl', 'ielts']
  }),

  dele: () => {
    const profile = officialProfile('DELE');
    return {
      h1: 'DELE A1 to C2: exam format by level and official resources',
      runBy: { name: 'Instituto Cervantes', url: 'https://cervantes.org/es/examenes/dele' },
      intro: [
        'The DELE (Diplomas de Español como Lengua Extranjera) are the official Spanish diplomas awarded by the Instituto Cervantes. Each CEFR level from A1 to C2 is a separate exam, and each diploma is awarded on a pass or fail basis.',
        'Below are the papers and timings for each level as published by Instituto Cervantes centres, followed by the official information pages.'
      ],
      facts: [
        ['Awarded by', 'Instituto Cervantes'],
        ['Levels', 'A1 to C2, each a separate exam'],
        ['Result', 'Pass or fail at the level taken'],
        ['C2 format', 'Three tests, following the official guide in force from May 2024']
      ],
      format: null,
      deleLevels: deleLevelTable(),
      scoring: profile.scoring,
      examIds: ['DELE'],
      planner: { exam: 'DELE', label: 'DELE' },
      faq: [
        {
          q: 'Is each DELE level a separate exam?',
          a: 'Yes. Each DELE diploma is a separate exam at a single CEFR level, from A1 to C2, and the Instituto Cervantes awards it when you meet the pass criteria for that level.'
        },
        {
          q: 'What is the format of DELE C2?',
          a: 'From the May 2024 session, DELE C2 has three tests: an integrated language-use, reading and listening paper (105 minutes), written expression, mediation and interaction (150 minutes), and oral expression, mediation and interaction (20 minutes plus 30 minutes of preparation).'
        },
        NOT_AFFILIATED('the Instituto Cervantes')
      ],
      sources: [
        { title: 'DELE exam format by level (Instituto Cervantes Munich)', url: profile.sourceUrl },
        { title: 'DELE C2 exam guide (Instituto Cervantes, PDF)', url: 'https://pro.cervantes.es/documents/d/tanger/guia_examen_dele_c2_2024_1-pdf?download=true' },
        { title: 'DELE: Instituto Cervantes', url: 'https://cervantes.org/es/examenes/dele' }
      ],
      related: ['goethe', 'ielts', 'toefl']
    };
  }
};

/** Full content for one exam guide page, or null for an unknown slug. */
export function examContent(slug) {
  const page = examPageBySlug(slug);
  const build = CONTENT[slug];
  if (!page || !build) return null;
  const body = build();
  const { groups, checked } = resourcesFor(body.examIds);
  return {
    ...page,
    ...body,
    resources: groups,
    lastChecked: checked,
    related: (body.related || []).map(examPageBySlug).filter(Boolean)
  };
}

export function allExamContent() {
  return EXAM_PAGES.map((p) => examContent(p.slug));
}
