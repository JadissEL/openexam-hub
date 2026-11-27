/**
 * Evergreen study-plan pages under the exam guides: /exams/<guide>/<plan-slug>.
 *
 * Plain data only (Node + browser). Every format fact is taken from the official page named in
 * `sources`, and every linked material is either in scripts/seed-candidates.json (the link-checked
 * library seed) or an official exam-body / government page. Schedules are suggestions for practice,
 * not predictions: no pass rates, no score promises, no testimonials.
 */

// ------------------------------------------------------------------ official URLs
const IRCC_TESTS =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html';
const IRCC_FSW =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/who-can-apply/federal-skilled-workers.html';

const FEI_TCF_TP = 'https://www.france-education-international.fr/test/tcf-tout-public';
const FEI_TCF_CA = 'https://www.france-education-international.fr/test/tcf-canada';
const TV5_TCF = 'https://apprendre.tv5monde.com/fr/tcf';
const TV5_BOOKLETS = 'https://apprendre.tv5monde.com/fr/article/les-livrets-dentrainement-au-tcf-r-avec-tv5monde';
const TV5_B1 = 'https://apprendre.tv5monde.com/fr/exercices/b1-intermediaire';
const TV5_B2 = 'https://apprendre.tv5monde.com/fr/exercices/b2-avance';
const RFI_JOURNAL = 'https://www.rfi.fr/fr/podcasts/journal-français-facile/';
const RFI_REVISER = 'https://francaisfacile.rfi.fr/fr/réviser/20261112-les-adjectifs-possessifs';
const RFI_DIPLOMES = 'https://francaisfacile.rfi.fr/fr/diplômes-tests/';

const TEF_PRESENTATION = 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/presentation/';
const TEF_PREP = 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/preparation/';
const TEF_RESULTS = 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/resultats/';
const TEF_NCLC_PDF = 'https://www.lefrancaisdesaffaires.fr/wp-content/uploads/2024/10/correspondance-tef-nclc.pdf';
const TEF_CE_PDF = 'https://www.lefrancaisdesaffaires.fr/wp-content/uploads/2024/10/tef-exemples-epreuves-ce.pdf';
const TEF_CO_PDF = 'https://www.lefrancaisdesaffaires.fr/wp-content/uploads/2024/10/tef-exemples-epreuves-co.pdf';
const TEF_CO_AUDIO = 'https://www.lefrancaisdesaffaires.fr/wp-content/uploads/2024/10/tef-bandes-sons-co.zip';
const TEF_EE_PDF = 'https://www.lefrancaisdesaffaires.fr/wp-content/uploads/2024/10/tef-exemples-epreuve-ee.pdf';
const TEF_EO_PDF = 'https://www.lefrancaisdesaffaires.fr/wp-content/uploads/2024/10/tef-exemples-epreuve-eo.pdf';
const TEF_GUIDE_CE = 'https://www.lefrancaisdesaffaires.fr/se-preparer-a-lepreuve-de-comprehension-ecrite-du-tef/';
const TEF_GUIDE_CO = 'https://www.lefrancaisdesaffaires.fr/se-preparer-a-lepreuve-de-comprehension-orale-du-tef/';
const TEF_GUIDE_EE_A = 'https://www.lefrancaisdesaffaires.fr/le-fait-divers-preparer-la-section-a-de-lexpression-ecrite-du-tef/';
const TEF_GUIDE_EE_B = 'https://www.lefrancaisdesaffaires.fr/largumentation-preparer-la-section-b-de-lexpression-ecrite-du-tef/';
const TEF_GUIDE_EO = 'https://www.lefrancaisdesaffaires.fr/se-preparer-a-lepreuve-dexpression-orale-du-tef/';

const IELTS_AC = 'https://ielts.org/take-a-test/test-types/ielts-academic-test';
const IELTS_GT = 'https://ielts.org/take-a-test/test-types/ielts-general-training-test';
const IELTS_LISTENING = 'https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening';
const IELTS_READING = 'https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading';
const IELTS_WRITING_AC = 'https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing';
const IELTS_WRITING_GT = 'https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-writing';
const IELTS_SPEAKING = 'https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking';
const IELTS_CEFR = 'https://ielts.org/organisations/ielts-for-organisations/compare-ielts/ielts-and-the-cefr';
const BC_MOCKS = 'https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests';
const IELTS_SAMPLES = 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions';
const IELTS_SAMPLES_AC = 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test';
const IELTS_SAMPLES_GT = 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions/general-training-test';
const CAMBRIDGE_IELTS = 'https://www.cambridgeenglish.org/exams-and-tests/ielts/preparation/';
const LE_LISTENING = 'https://learnenglish.britishcouncil.org/free-resources/listening';
const LE_READING = 'https://learnenglish.britishcouncil.org/free-resources/reading';
const LE_WRITING = 'https://learnenglish.britishcouncil.org/free-resources/writing';
const IELTS_WRITING_BD = 'https://ielts.org/cdn/ielts-downloadable-assets/ielts-guidance-and-support/ielts-guides/ielts-writing-band-descriptors.pdf';

const GOETHE_HUB = 'https://www.goethe.de/de/spr/prf/ueb.html';
const GOETHE_B1_PRACTICE = 'https://www.goethe.de/de/spr/prf/ueb/pb1.html';
const GOETHE_B1_INFO = 'https://www.goethe.de/ins/mm/de/spr/prf/gzb1/inf.html';
const GOETHE_B1_RULES = 'https://www.goethe.de/pro/relaunch/prf/de/Durchfuehrungsbestimmungen_B1.pdf';
const GOETHE_ACCESSIBLE = 'https://www.goethe.de/de/spr/prf/ueb/bpf.html';
const DW = 'https://learngerman.dw.com';
const VHS = 'https://www.vhs-lernportal.de';

const L = (label, url) => ({ label, url });

// ------------------------------------------------------------------ pages

export const PLAN_PAGES = [
  // 1 ---------------------------------------------------------------- TCF Canada
  {
    guide: 'tcf-canada',
    slug: 'official-practice-study-path',
    label: 'TCF Canada official practice and 30-day study path',
    breadcrumb: 'Official practice and study path',
    level: 'NCLC 7 example target',
    duration: '30 days',
    tags: ['TCF_CANADA'],
    title: 'TCF Canada official practice and 30-day study path',
    description:
      'A free 30-day TCF Canada path using only official and public-broadcaster practice, with the four papers, timings and IRCC’s NCLC 7 score bands.',
    h1: 'TCF Canada: official practice and a 30-day study path',
    subhead:
      'A practice schedule built from free official material. It does not predict your NCLC level: only France Éducation international’s results do, and IRCC decides how they are used.',
    whoFor: [
      'People taking TCF Canada for Express Entry or another IRCC application who already read and listen to everyday French with some ease and want a structured last month.',
      'NCLC 7 is used here as the example goal because it is the minimum IRCC sets for French as a first official language in the Federal Skilled Worker Program, in all four abilities. Your programme may ask for a different level; check IRCC.',
      'Plan on roughly an hour a day. If your exam is further away, stretch each phase rather than skipping one.'
    ],
    facts: [
      ['Papers', 'Listening 35 min (39 questions), reading 60 min (39 questions), writing 60 min (3 tasks), speaking 12 min (3 tasks), all compulsory'],
      ['Total time', '2 h 47 min'],
      ['Scores', 'Each paper is scored separately; there is no overall average'],
      ['NCLC 7 on IRCC’s table', 'Listening 458–502, reading 453–498, speaking 10–11, writing 10–11'],
      ['Validity for Express Entry', 'Results must be less than 2 years old when you create your profile and when you apply']
    ],
    factsNote:
      'Score bands copied from IRCC’s Express Entry language-test page on 20 November 2026. IRCC can change them: check the page before you rely on them.',
    materials: [
      L('France Éducation international: TCF Canada (format and candidate information)', FEI_TCF_CA),
      L('TV5Monde: free TCF practice', TV5_TCF),
      L('TV5Monde: TCF training booklets with audio (PDF + MP3)', TV5_BOOKLETS),
      L('TV5Monde: B2 exercises', TV5_B2),
      L('RFI: Journal en français facile (daily news, with transcripts)', RFI_JOURNAL),
      L('RFI: listening practice for French diplomas and tests', RFI_DIPLOMES),
      L('IRCC: Express Entry language test results', IRCC_TESTS)
    ],
    phases: [
      {
        title: 'Days 1–7: Know the test and take a baseline',
        focus: 'Format, IRCC requirements, a first timed listening and reading set',
        tasks: [
          { when: 'Day 1', text: 'Read France Éducation international’s TCF Canada page: four compulsory papers, their timings and how results are reported. Then read IRCC’s language-test page and note the NCLC level your programme needs.', links: [L('FEI TCF Canada', FEI_TCF_CA), L('IRCC language tests', IRCC_TESTS)] },
          { when: 'Days 2–3', text: 'Do one TV5Monde TCF listening set and one reading set without pausing. Write down every question you missed and why (vocabulary, speed, distractor).', links: [L('TV5Monde TCF', TV5_TCF)] },
          { when: 'Days 4–5', text: 'Open the TV5Monde TCF training booklets. Read the writing and speaking task descriptions so you know what each of the 3 tasks asks for.', links: [L('TV5Monde booklets', TV5_BOOKLETS)] },
          { when: 'Days 6–7', text: 'Listen to one RFI Journal en français facile episode a day, first without, then with the transcript. Keep a list of new words and phrases.', links: [L('RFI Journal en français facile', RFI_JOURNAL)] }
        ]
      },
      {
        title: 'Days 8–18: Build each skill',
        focus: 'Daily listening and reading, then the writing and speaking tasks',
        tasks: [
          { when: 'Days 8–11', text: 'Alternate TV5Monde TCF listening and reading practice with B2 exercises on the topics you missed in the baseline. Keep to the real pace: about 35 minutes for 39 listening questions and 60 minutes for 39 reading questions.', links: [L('TV5Monde TCF', TV5_TCF), L('TV5Monde B2', TV5_B2)] },
          { when: 'Days 12–15', text: 'Writing: write one response for each of the three task types in the booklets, within 60 minutes for all three. Compare with the booklet’s guidance and rewrite the weakest one.', links: [L('TV5Monde booklets', TV5_BOOKLETS)] },
          { when: 'Days 16–18', text: 'Speaking: record yourself on each of the three speaking task types and listen back. Total speaking time in the exam is 12 minutes, so practise answering at length without long pauses.', links: [L('TV5Monde booklets', TV5_BOOKLETS)] }
        ]
      },
      {
        title: 'Days 19–26: Timed practice and an error log',
        focus: 'Full-length timing for each paper',
        tasks: [
          { when: 'Days 19–21', text: 'Sit listening (35 min) and reading (60 min) back to back with TV5Monde practice. Log each error by type.', links: [L('TV5Monde TCF', TV5_TCF)] },
          { when: 'Days 22–24', text: 'One timed writing session (3 tasks in 60 min) and one recorded speaking session (3 tasks). Redo the weakest task the next day.', links: [L('TV5Monde booklets', TV5_BOOKLETS)] },
          { when: 'Days 25–26', text: 'Work through your error log with RFI listening practice and TV5Monde exercises on the same topics.', links: [L('RFI diplomas and tests', RFI_DIPLOMES), L('TV5Monde B2', TV5_B2)] }
        ]
      },
      {
        title: 'Days 27–30: Review, logistics, rest',
        focus: 'Light practice and exam-day preparation',
        tasks: [
          { when: 'Days 27–28', text: 'One last short listening and reading set. Re-read your best writing and speaking answers rather than starting new ones.', links: [L('TV5Monde TCF', TV5_TCF)] },
          { when: 'Day 29', text: 'Re-check your test centre’s instructions and IRCC’s validity rule (results under 2 years old when you create your profile and when you apply).', links: [L('IRCC language tests', IRCC_TESTS)] },
          { when: 'Day 30', text: 'Rest. Light listening only.', links: [] }
        ]
      }
    ],
    caution:
      'TV5Monde and RFI practice is free and close to the exam’s skills, but a score on those sites is not an official TCF result and does not convert to NCLC.',
    faq: [
      { q: 'What TCF Canada scores count as NCLC 7?', a: 'On IRCC’s Express Entry table (checked 20 November 2026), NCLC 7 is listening 458–502, reading 453–498, speaking 10–11 and writing 10–11. IRCC can update these bands, so check its language-test page before you apply.' },
      { q: 'Is NCLC 7 the level I need?', a: 'Not necessarily. NCLC 7 in all four abilities is the minimum for French as a first official language in the Federal Skilled Worker Program. Other programmes set other levels, so check the IRCC page for yours.' },
      { q: 'Can this plan guarantee my score?', a: 'No. It is a practice schedule. Only France Éducation international issues TCF Canada results, and nobody can promise a level in advance.' },
      { q: 'How long are TCF Canada results valid for Express Entry?', a: 'IRCC says results must be less than 2 years old when you complete your Express Entry profile and when you submit your application for permanent residence.' }
    ],
    sources: [
      L('France Éducation international: TCF Canada', FEI_TCF_CA),
      L('IRCC: Express Entry language test results', IRCC_TESTS),
      L('IRCC: Federal Skilled Worker Program', IRCC_FSW)
    ],
    lastChecked: '2026-11-20',
    related: [
      { type: 'plan', guide: 'tef-canada', slug: '30-day-study-plan' },
      { type: 'plan', guide: 'tcf', slug: 'b2-30-day-study-plan' },
      { type: 'guide', guide: 'tef-canada' }
    ]
  },

  // 2 ---------------------------------------------------------------- TEF Canada
  {
    guide: 'tef-canada',
    slug: '30-day-study-plan',
    label: 'TEF Canada 30-day study plan',
    breadcrumb: '30-day study plan',
    level: 'NCLC 7 example target',
    duration: '30 days',
    tags: ['TEF_CANADA', 'TEF'],
    title: 'TEF Canada 30-day study plan with official practice',
    description:
      'A free day-by-day TEF Canada plan using the official sample papers, audio and guides from Le français des affaires, with IRCC’s NCLC 7 score bands.',
    h1: 'TEF Canada: a 30-day study plan with official practice',
    subhead:
      'A practice schedule that uses only the sample papers and preparation guides published by CCI Paris Île-de-France / Le français des affaires. It does not predict your NCLC level.',
    whoFor: [
      'People taking TEF Canada for an IRCC application who already manage everyday French and want a structured final month.',
      'NCLC 7 is the example goal because it is IRCC’s minimum for French as a first official language in the Federal Skilled Worker Program. Your programme may differ.',
      'Plan on roughly an hour a day. For citizenship, only listening and speaking are required, so you can drop the reading and writing days.'
    ],
    facts: [
      ['Tests', 'Reading 60 min (40 questions), listening 40 min (40 questions), writing 60 min (2 sections), speaking 15 min (2 sections)'],
      ['Writing', 'Section A, 25 min: continue a news article, 80 words minimum. Section B, 35 min: argue a point of view, 200 words minimum'],
      ['Speaking', 'Section A, 5 min: obtain information. Section B, 10 min: argue to convince. Face-to-face, recorded'],
      ['NCLC 7 on IRCC’s table', 'Speaking 310–348, listening 249–279, reading 207–232, writing 310–348 (IRCC uses the “Équivalence ancien score”)'],
      ['Validity', 'CCI Paris: certificate valid 2 years. IRCC: results under 2 years old when you create your profile and apply']
    ],
    factsNote:
      'Score bands copied from IRCC’s Express Entry language-test page on 20 November 2026; IRCC bases TEF levels on the “Équivalence ancien score” shown on your results. Check the page before you rely on them.',
    materials: [
      L('Le français des affaires: TEF Canada presentation', TEF_PRESENTATION),
      L('Le français des affaires: TEF Canada preparation hub', TEF_PREP),
      L('Official sample questions: reading (PDF)', TEF_CE_PDF),
      L('Official sample questions: listening (PDF)', TEF_CO_PDF),
      L('Official listening audio (ZIP)', TEF_CO_AUDIO),
      L('Official sample tasks: writing (PDF)', TEF_EE_PDF),
      L('Official sample tasks: speaking (PDF)', TEF_EO_PDF),
      L('Official TEF–NCLC correspondence table (PDF)', TEF_NCLC_PDF),
      L('IRCC: Express Entry language test results', IRCC_TESTS)
    ],
    phases: [
      {
        title: 'Days 1–7: Format, scores and a baseline',
        focus: 'Know the four tests and sit the official reading and listening samples',
        tasks: [
          { when: 'Day 1', text: 'Read the official TEF Canada presentation and results pages, then IRCC’s language-test page. Note the NCLC level your programme needs in each ability.', links: [L('TEF presentation', TEF_PRESENTATION), L('TEF results', TEF_RESULTS), L('IRCC', IRCC_TESTS)] },
          { when: 'Days 2–3', text: 'Sit the official reading sample under time. In the real test you have 60 minutes for 40 questions.', links: [L('Reading sample (PDF)', TEF_CE_PDF)] },
          { when: 'Days 4–5', text: 'Sit the official listening sample with the official audio. Do not pause or replay: the real test gives 40 minutes for 40 questions.', links: [L('Listening sample (PDF)', TEF_CO_PDF), L('Audio (ZIP)', TEF_CO_AUDIO)] },
          { when: 'Days 6–7', text: 'Read the official reading and listening preparation guides and list the question types that cost you most points.', links: [L('Reading guide', TEF_GUIDE_CE), L('Listening guide', TEF_GUIDE_CO)] }
        ]
      },
      {
        title: 'Days 8–17: Writing and speaking',
        focus: 'The two writing sections and the two speaking sections',
        tasks: [
          { when: 'Days 8–10', text: 'Writing section A (fait divers): read the official guide, then write two continuations of a news article in 25 minutes each, at least 80 words.', links: [L('Section A guide', TEF_GUIDE_EE_A), L('Writing samples (PDF)', TEF_EE_PDF)] },
          { when: 'Days 11–13', text: 'Writing section B (argumentation): read the official guide, then write two opinion texts in 35 minutes each, at least 200 words, with a clear position and examples.', links: [L('Section B guide', TEF_GUIDE_EE_B), L('Writing samples (PDF)', TEF_EE_PDF)] },
          { when: 'Days 14–17', text: 'Speaking: read the official guide, then record section A (5 minutes, asking for information) and section B (10 minutes, convincing someone) from the official sample tasks. Listen back and redo the weaker one.', links: [L('Speaking guide', TEF_GUIDE_EO), L('Speaking samples (PDF)', TEF_EO_PDF)] }
        ]
      },
      {
        title: 'Days 18–26: Timed run-through and an error log',
        focus: 'All four tests under official timings',
        tasks: [
          { when: 'Days 18–20', text: 'Re-sit the reading (60 min) and listening (40 min) samples under strict timing. Compare with your first attempt and update your error log.', links: [L('Reading sample', TEF_CE_PDF), L('Listening sample', TEF_CO_PDF), L('Audio', TEF_CO_AUDIO)] },
          { when: 'Days 21–23', text: 'One full writing paper (section A then B, 60 minutes) and one full recorded speaking practice (15 minutes).', links: [L('Writing samples', TEF_EE_PDF), L('Speaking samples', TEF_EO_PDF)] },
          { when: 'Days 24–26', text: 'Work through the official preparation hub for whichever test still feels weakest.', links: [L('Preparation hub', TEF_PREP)] }
        ]
      },
      {
        title: 'Days 27–30: Review and rest',
        focus: 'Light practice and logistics',
        tasks: [
          { when: 'Days 27–28', text: 'Re-read your best writing texts and listen to your best speaking recordings. Review the error log once more.', links: [] },
          { when: 'Day 29', text: 'Check your centre’s instructions. For an immigration application, all four tests are taken on the same day.', links: [L('TEF presentation', TEF_PRESENTATION)] },
          { when: 'Day 30', text: 'Rest.', links: [] }
        ]
      }
    ],
    caution:
      'There is only one official sample per test, so repeat it with the preparation guides rather than looking for unofficial “real papers”, which may be inaccurate or copied without permission.',
    faq: [
      { q: 'What TEF Canada scores count as NCLC 7?', a: 'On IRCC’s Express Entry table (checked 20 November 2026), NCLC 7 is speaking 310–348, listening 249–279, reading 207–232 and writing 310–348, based on the “Équivalence ancien score”. Check IRCC’s page before you apply.' },
      { q: 'Do I need all four TEF Canada tests?', a: 'For an immigration application, yes: all four are compulsory and taken on the same day. For Canadian citizenship, only listening and speaking are required.' },
      { q: 'Is there more official practice than the sample papers?', a: 'Le français des affaires publishes one set of sample questions per test plus preparation guides for each test. This plan uses all of them. Nothing here comes from unofficial question banks.' },
      { q: 'Will this plan get me NCLC 7?', a: 'Nobody can promise that. This is a practice schedule; your level comes only from your official TEF Canada results.' }
    ],
    sources: [
      L('Le français des affaires: TEF Canada presentation', TEF_PRESENTATION),
      L('Le français des affaires: TEF Canada preparation', TEF_PREP),
      L('IRCC: Express Entry language test results', IRCC_TESTS),
      L('IRCC: Federal Skilled Worker Program', IRCC_FSW)
    ],
    lastChecked: '2026-11-20',
    related: [
      { type: 'plan', guide: 'tcf-canada', slug: 'official-practice-study-path' },
      { type: 'guide', guide: 'tcf-canada' },
      { type: 'guide', guide: 'delf' }
    ]
  },

  // 3 ---------------------------------------------------------------- IELTS
  {
    guide: 'ielts',
    slug: '8-week-study-plan',
    label: 'IELTS 8-week study plan toward band 6.5',
    breadcrumb: '8-week study plan',
    level: 'Band 6.5 target',
    duration: '8 weeks',
    tags: ['IELTS'],
    title: 'IELTS 8-week study plan toward band 6.5',
    description:
      'A free 8-week IELTS plan toward band 6.5 using only British Council, IELTS.org and Cambridge practice. Week-by-week tasks for all four sections.',
    h1: 'IELTS: an 8-week study plan toward band 6.5',
    subhead:
      'Band 6.5 is a goal, not a promise. This is a practice schedule using free official material; it does not predict your band.',
    whoFor: [
      'Test takers who are already close to their target, for example scoring around band 5.5–6.0 on official practice, and want eight structured weeks.',
      'Works for IELTS Academic and General Training: Listening and Speaking are the same in both; Reading and Writing differ, so open the matching official samples.',
      'Plan on roughly an hour a day, five or six days a week.'
    ],
    facts: [
      ['Listening', 'About 30 min, 4 parts, 40 questions; recordings heard once'],
      ['Reading', '60 min, 3 sections, 40 questions'],
      ['Writing', '60 min, 2 tasks: Task 1 at least 150 words in about 20 min, Task 2 at least 250 words in about 40 min. Task 2 counts twice as much as Task 1'],
      ['Speaking', '11–14 min, 3 parts, face-to-face with an examiner'],
      ['Band 6.5 and the CEFR', 'IELTS’s alignment is approximate: band 6.5 sits on the border between B2 and C1']
    ],
    factsNote: 'Format from IELTS.org’s official test-format pages and CEFR alignment from IELTS.org’s “IELTS and the CEFR” page, checked 20 November 2026.',
    materials: [
      L('British Council: free official IELTS practice and mock tests', BC_MOCKS),
      L('IELTS.org: official sample test questions', IELTS_SAMPLES),
      L('IELTS.org: Academic sample questions', IELTS_SAMPLES_AC),
      L('IELTS.org: General Training sample questions', IELTS_SAMPLES_GT),
      L('Cambridge English: official IELTS preparation', CAMBRIDGE_IELTS),
      L('IELTS.org: Writing band descriptors (PDF)', IELTS_WRITING_BD),
      L('British Council LearnEnglish: listening, reading and writing', LE_LISTENING)
    ],
    phases: [
      {
        title: 'Week 1: Diagnostic',
        focus: 'Pick the right version and take a full official mock',
        tasks: [
          { when: 'Days 1–2', text: 'Confirm whether you need Academic or General Training (for Express Entry, IRCC accepts only General Training). Read the official format pages for each section.', links: [L('Academic', IELTS_AC), L('General Training', IELTS_GT), L('IRCC', IRCC_TESTS)] },
          { when: 'Days 3–5', text: 'Take a full British Council practice test, section by section, under official timings. Note your raw score per section and the question types you missed.', links: [L('British Council practice tests', BC_MOCKS)] },
          { when: 'Days 6–7', text: 'Read the official Writing band descriptors and mark your two practice texts against Task achievement/response, Coherence and cohesion, Lexical resource, and Grammatical range and accuracy.', links: [L('Writing band descriptors (PDF)', IELTS_WRITING_BD)] }
        ]
      },
      {
        title: 'Weeks 2–4: Skills by question type',
        focus: 'Official samples for each section, one weakness at a time',
        tasks: [
          { when: 'Week 2', text: 'Listening and Reading: work through the official sample questions for your version, one question type per day. Keep an error log with the reason for each miss.', links: [L('IELTS.org samples', IELTS_SAMPLES), L('Listening format', IELTS_LISTENING), L('Reading format', IELTS_READING)] },
          { when: 'Week 3', text: 'Writing: three Task 1 and three Task 2 responses from official samples, timed at about 20 and 40 minutes. Re-mark each against the band descriptors and rewrite one.', links: [L('Academic writing format', IELTS_WRITING_AC), L('General Training writing format', IELTS_WRITING_GT), L('Band descriptors', IELTS_WRITING_BD)] },
          { when: 'Week 4', text: 'Speaking: practise Part 1 questions on familiar topics, Part 2 long turns (1 minute to prepare, up to 2 minutes speaking) and Part 3 discussion. Record and review against fluency, vocabulary, grammar and pronunciation.', links: [L('Speaking format', IELTS_SPEAKING), L('Cambridge preparation', CAMBRIDGE_IELTS)] }
        ]
      },
      {
        title: 'Weeks 5–7: Full sections and the error log',
        focus: 'Timed sections, then targeted repair',
        tasks: [
          { when: 'Week 5', text: 'One full timed Listening and Reading section every other day from official practice; on the days between, review errors with LearnEnglish listening and reading practice at your level.', links: [L('British Council practice tests', BC_MOCKS), L('LearnEnglish listening', LE_LISTENING), L('LearnEnglish reading', LE_READING)] },
          { when: 'Week 6', text: 'Two full timed Writing papers (Task 1 + Task 2 in 60 minutes). Spend more time on Task 2, which counts twice as much.', links: [L('Band descriptors', IELTS_WRITING_BD), L('LearnEnglish writing', LE_WRITING)] },
          { when: 'Week 7', text: 'A second full official mock across all four sections. Compare section by section with Week 1 and spend the rest of the week on the section that moved least.', links: [L('British Council practice tests', BC_MOCKS), L('Cambridge preparation', CAMBRIDGE_IELTS)] }
        ]
      },
      {
        title: 'Week 8: Taper and logistics',
        focus: 'Light practice, booking details, rest',
        tasks: [
          { when: 'Days 1–4', text: 'Short daily sets only: one Listening part, one Reading passage, one Task 2 plan, one Part 2 long turn.', links: [L('IELTS.org samples', IELTS_SAMPLES)] },
          { when: 'Days 5–6', text: 'Re-check your booking, ID and test-centre instructions on the official IELTS site.', links: [L('IELTS', IELTS_AC)] },
          { when: 'Day 7', text: 'Rest before test day.', links: [] }
        ]
      }
    ],
    caution:
      'Scores on free practice tests are a guide only. They are not an official IELTS result and are not a prediction of your band.',
    faq: [
      { q: 'Can I get band 6.5 in 8 weeks?', a: 'This plan cannot promise any band. Eight weeks of structured official practice helps most if you are already close to your target; how far you move depends on where you start and how much you practise.' },
      { q: 'Academic or General Training?', a: 'IELTS says to choose Academic for undergraduate or postgraduate study, and General Training to migrate to an English-speaking country or to train or study below degree level. For Express Entry, IRCC accepts only General Training.' },
      { q: 'What IELTS score is CLB 7 for Express Entry?', a: 'On IRCC’s table for the Federal Skilled Worker Program (checked 20 November 2026), CLB 7 is 6.0 in each of speaking, listening, reading and writing on IELTS General Training. Check IRCC’s page for the current table.' },
      { q: 'Which writing task matters more?', a: 'Task 2. IELTS states that Task 2 contributes twice as much as Task 1 to the Writing score.' }
    ],
    sources: [
      L('IELTS.org: IELTS Academic test', IELTS_AC),
      L('IELTS.org: Listening format', IELTS_LISTENING),
      L('IELTS.org: Reading format', IELTS_READING),
      L('IELTS.org: Academic Writing format', IELTS_WRITING_AC),
      L('IELTS.org: Speaking format', IELTS_SPEAKING),
      L('IELTS.org: IELTS and the CEFR', IELTS_CEFR),
      L('IRCC: Express Entry language test results', IRCC_TESTS)
    ],
    lastChecked: '2026-11-20',
    related: [
      { type: 'guide', guide: 'toefl' },
      { type: 'plan', guide: 'tef-canada', slug: '30-day-study-plan' },
      { type: 'guide', guide: 'tcf-canada' }
    ]
  },

  // 4 ---------------------------------------------------------------- TCF tout public B2
  {
    guide: 'tcf',
    slug: 'b2-30-day-study-plan',
    label: 'TCF B2 30-day study plan',
    breadcrumb: 'B2 30-day study plan',
    level: 'CEFR B2',
    duration: '30 days',
    tags: ['TCF'],
    title: 'TCF B2 30-day study plan from free official sources',
    description:
      'A free 30-day plan for TCF tout public candidates aiming at B2: the three compulsory papers, then the optional ones, with TV5Monde and RFI practice.',
    h1: 'TCF B2: a free 30-day study plan',
    subhead:
      'A practice schedule for TCF tout public candidates already around B1–B2. It does not predict the level you will be awarded.',
    whoFor: [
      'TCF tout public candidates already working at around B1 or B2 who want a structured final month. It is not a plan to go from beginner to B2 in 30 days.',
      'If you are applying to IRCC, you need TCF Canada instead: see the TCF Canada study path.',
      'Plan on roughly an hour a day.'
    ],
    toolNote: {
      lead: 'If you are applying through Express Entry, use the TCF Canada study path rather than this TCF tout public plan. Convert TCF Canada scores with the',
      href: '/tools/clb-converter',
      anchor: 'CLB / NCLC score converter',
      tail: 'It uses IRCC’s official tables and does not convert TCF tout public scores.'
    },
    facts: [
      ['Compulsory papers', 'Listening 25 min (29 questions), language structures 15 min (18 questions), reading 45 min (29 questions): 1 h 25 min in total'],
      ['Optional papers', 'Writing 60 min (3 tasks), speaking 12 min (3 tasks), face-to-face'],
      ['Scores', 'Each paper is reported as a CEFR level from below A1 to C2; optional papers are reported separately']
    ],
    factsNote: 'Format from France Éducation international’s TCF tout public page, as recorded in OpenExam Hub’s sourced exam profiles.',
    materials: [
      L('France Éducation international: TCF tout public', FEI_TCF_TP),
      L('TV5Monde: free TCF practice', TV5_TCF),
      L('TV5Monde: TCF training booklets with audio (PDF + MP3)', TV5_BOOKLETS),
      L('TV5Monde: B1 exercises', TV5_B1),
      L('TV5Monde: B2 exercises', TV5_B2),
      L('RFI: Journal en français facile', RFI_JOURNAL),
      L('RFI: revise key points of French grammar', RFI_REVISER)
    ],
    phases: [
      {
        title: 'Days 1–10: Baseline and listening',
        focus: 'Know the papers, test yourself, then daily listening',
        tasks: [
          { when: 'Day 1', text: 'Read France Éducation international’s TCF tout public page and decide whether you are also taking the optional writing and speaking papers.', links: [L('FEI TCF tout public', FEI_TCF_TP)] },
          { when: 'Days 2–3', text: 'Do one TV5Monde TCF listening set and one reading set without pausing. Note the question types and topics you missed.', links: [L('TV5Monde TCF', TV5_TCF)] },
          { when: 'Days 4–10', text: 'Every day: one RFI Journal en français facile episode (first without the transcript, then with it) plus one TV5Monde B2 listening exercise.', links: [L('RFI Journal', RFI_JOURNAL), L('TV5Monde B2', TV5_B2)] }
        ]
      },
      {
        title: 'Days 11–20: Language structures and reading',
        focus: 'Grammar and vocabulary for the 18 structure questions, then timed reading',
        tasks: [
          { when: 'Days 11–14', text: 'Review one grammar point a day with RFI’s revision pages (for example verb moods, relative pronouns, connectors), then do the matching TV5Monde B1 or B2 exercises.', links: [L('RFI réviser', RFI_REVISER), L('TV5Monde B1', TV5_B1), L('TV5Monde B2', TV5_B2)] },
          { when: 'Days 15–17', text: 'Timed reading: TV5Monde TCF reading practice at the real pace (29 questions in 45 minutes).', links: [L('TV5Monde TCF', TV5_TCF)] },
          { when: 'Days 18–20', text: 'Use the TV5Monde training booklets for structure and reading items; log each mistake with the rule behind it.', links: [L('TV5Monde booklets', TV5_BOOKLETS)] }
        ]
      },
      {
        title: 'Days 21–30: Timed practice, optional papers, rest',
        focus: 'The 1 h 25 min compulsory block, plus writing and speaking if you take them',
        tasks: [
          { when: 'Days 21–24', text: 'Twice: sit listening (25 min), structures (15 min) and reading (45 min) in one block. Review every error the next day.', links: [L('TV5Monde TCF', TV5_TCF)] },
          { when: 'Days 25–27', text: 'If you take the optional papers: one timed writing session (3 tasks in 60 minutes) and one recorded speaking session (3 tasks) using the booklet task descriptions.', links: [L('TV5Monde booklets', TV5_BOOKLETS)] },
          { when: 'Days 28–29', text: 'Go through your error log once more; light listening only.', links: [L('RFI Journal', RFI_JOURNAL)] },
          { when: 'Day 30', text: 'Rest.', links: [] }
        ]
      }
    ],
    caution:
      'TV5Monde and RFI practice is free and close to the exam’s skills, but a score there is not an official TCF result.',
    faq: [
      { q: 'Can I reach B2 in 30 days?', a: 'This plan does not promise a level. It is meant for people already around B1–B2 who want structured practice before the exam.' },
      { q: 'Is the TCF scored as pass or fail?', a: 'No. Each paper is reported as a CEFR level from below A1 to C2, and the optional writing and speaking papers are reported separately.' },
      { q: 'Can I use this plan for TCF Canada?', a: 'TCF Canada has four compulsory papers and no language-structures paper, so use the TCF Canada study path instead.' }
    ],
    sources: [
      L('France Éducation international: TCF tout public', FEI_TCF_TP),
      L('TV5Monde: TCF practice', TV5_TCF),
      L('RFI: Français facile', RFI_JOURNAL)
    ],
    lastChecked: '2026-11-20',
    related: [
      { type: 'plan', guide: 'tcf-canada', slug: 'official-practice-study-path' },
      { type: 'guide', guide: 'delf' },
      { type: 'guide', guide: 'tef-canada' }
    ]
  },

  // 5 ---------------------------------------------------------------- Goethe B1
  {
    guide: 'goethe',
    slug: 'b1-30-day-study-plan',
    label: 'Goethe-Zertifikat B1 30-day study plan',
    breadcrumb: 'B1 30-day study plan',
    level: 'CEFR B1',
    duration: '30 days',
    tags: ['GOETHE'],
    title: 'Goethe-Zertifikat B1: free 30-day study plan',
    description:
      'A free 30-day Goethe-Zertifikat B1 plan using the Goethe-Institut’s official B1 practice, DW and the VHS Lernportal, module by module.',
    h1: 'Goethe-Zertifikat B1: a free 30-day study plan',
    subhead:
      'A practice schedule for learners already working at B1, built from the Goethe-Institut’s free official practice. It does not predict your result.',
    whoFor: [
      'Learners already working at B1 who want a structured final month. The Goethe-Institut estimates that reaching B1 takes 350 to 650 teaching units of 45 minutes, depending on prior knowledge, so this is not a from-scratch plan.',
      'The four modules can be taken separately or together; skip the phases for modules you are not sitting.',
      'Plan on roughly an hour a day.'
    ],
    facts: [
      ['Lesen (reading)', '65 min: blog posts, emails, newspaper articles, adverts and instructions'],
      ['Hören (listening)', 'About 40 min: announcements, short talks, informal conversations, radio discussions'],
      ['Schreiben (writing)', '60 min: personal and formal emails or letters, and an opinion in a forum post'],
      ['Sprechen (speaking)', 'About 15 min in pairs (about 10 min individually), plus 15 min preparation: plan something together and give a short presentation'],
      ['Modules', 'Four modules, taken individually or in combination']
    ],
    factsNote: 'Format from the Goethe-Institut’s Goethe-Zertifikat B1 information page and exam regulations (Durchführungsbestimmungen).',
    materials: [
      L('Goethe-Institut: official Goethe-Zertifikat B1 practice', GOETHE_B1_PRACTICE),
      L('Goethe-Institut: practice materials for all levels', GOETHE_HUB),
      L('Goethe-Institut: accessible practice tests', GOETHE_ACCESSIBLE),
      L('Goethe-Institut: Goethe-Zertifikat B1 information', GOETHE_B1_INFO),
      L('DW Learn German (free courses and exercises)', DW),
      L('VHS Lernportal (free self-study courses)', VHS)
    ],
    phases: [
      {
        title: 'Days 1–7: The modules and a baseline',
        focus: 'Official format, then the official Lesen and Hören practice',
        tasks: [
          { when: 'Day 1', text: 'Read the Goethe-Institut B1 information page: what each module tests and how long it takes. Decide which modules you are sitting.', links: [L('B1 information', GOETHE_B1_INFO)] },
          { when: 'Days 2–3', text: 'Do the Lesen part of the official B1 practice material in 65 minutes. Mark it and note which text types slowed you down.', links: [L('Official B1 practice', GOETHE_B1_PRACTICE)] },
          { when: 'Days 4–5', text: 'Do the Hören part of the official B1 practice material under exam conditions (about 40 minutes).', links: [L('Official B1 practice', GOETHE_B1_PRACTICE)] },
          { when: 'Days 6–7', text: 'Start a daily listening habit with DW Learn German at B1 and keep a vocabulary list by topic (travel, work, health, media).', links: [L('DW Learn German', DW)] }
        ]
      },
      {
        title: 'Days 8–18: Schreiben and Sprechen',
        focus: 'Emails, letters and forum posts; planning together and presenting',
        tasks: [
          { when: 'Days 8–11', text: 'Schreiben: write one personal email, one formal email or letter, and one forum opinion post based on the official practice tasks. Cover every point the task asks for.', links: [L('Official B1 practice', GOETHE_B1_PRACTICE)] },
          { when: 'Days 12–14', text: 'Fill grammar gaps you noticed (for example subordinate clauses, connectors, prepositions with cases) with the VHS Lernportal B1 course.', links: [L('VHS Lernportal', VHS)] },
          { when: 'Days 15–18', text: 'Sprechen: practise planning something together with a partner and giving a short presentation on an everyday topic, then answering questions about it. Record yourself and keep to time.', links: [L('Official B1 practice', GOETHE_B1_PRACTICE)] }
        ]
      },
      {
        title: 'Days 19–26: Timed modules',
        focus: 'Official timings and an error log',
        tasks: [
          { when: 'Days 19–21', text: 'Re-sit Lesen (65 min) and Hören (about 40 min) from the official practice under strict timing. Compare with Days 2–5.', links: [L('Official B1 practice', GOETHE_B1_PRACTICE)] },
          { when: 'Days 22–24', text: 'One full timed Schreiben module (60 min) and one recorded Sprechen practice, using 15 minutes of preparation as in the exam.', links: [L('Official B1 practice', GOETHE_B1_PRACTICE)] },
          { when: 'Days 25–26', text: 'Work on the module with the most errors, using DW and VHS exercises on the same topics.', links: [L('DW Learn German', DW), L('VHS Lernportal', VHS)] }
        ]
      },
      {
        title: 'Days 27–30: Review and rest',
        focus: 'Light practice and exam-day details',
        tasks: [
          { when: 'Days 27–28', text: 'Review your vocabulary list and your best Schreiben texts. One short DW listening a day.', links: [L('DW Learn German', DW)] },
          { when: 'Day 29', text: 'Check your exam centre’s instructions and which modules you registered for.', links: [L('B1 information', GOETHE_B1_INFO)] },
          { when: 'Day 30', text: 'Rest.', links: [] }
        ]
      }
    ],
    caution:
      'Use only the Goethe-Institut’s own practice material for timed runs. Unofficial “Modellsätze” found elsewhere may not match the current exam.',
    faq: [
      { q: 'How long is the Goethe-Zertifikat B1?', a: 'The written modules take about 165 minutes in total: Lesen 65 minutes, Hören about 40 minutes and Schreiben 60 minutes, with breaks between them. Sprechen takes about 15 minutes in pairs (about 10 individually) plus 15 minutes of preparation.' },
      { q: 'Can I take the B1 modules separately?', a: 'Yes. The Goethe-Institut says the four modules can be taken individually or in combination.' },
      { q: 'Can I go from A2 to B1 in 30 days with this plan?', a: 'This plan does not promise that. The Goethe-Institut estimates 350 to 650 teaching units of 45 minutes to reach B1, depending on prior knowledge. The plan is for learners already working at B1.' },
      { q: 'Where is the official B1 practice material?', a: 'On the Goethe-Institut’s practice pages for Goethe-Zertifikat B1, linked on this page, together with accessible versions.' }
    ],
    sources: [
      L('Goethe-Institut: Goethe-Zertifikat B1 information', GOETHE_B1_INFO),
      L('Goethe-Institut: Goethe-Zertifikat B1 exam regulations (PDF)', GOETHE_B1_RULES),
      L('Goethe-Institut: B1 practice material', GOETHE_B1_PRACTICE)
    ],
    lastChecked: '2026-11-20',
    related: [
      { type: 'guide', guide: 'dele' },
      { type: 'plan', guide: 'ielts', slug: '8-week-study-plan' },
      { type: 'guide', guide: 'toefl' }
    ]
  }
];

export function planPath(p) {
  return `/exams/${p.guide}/${p.slug}`;
}

export function planPage(guide, slug) {
  return PLAN_PAGES.find((p) => p.guide === guide && p.slug === slug) || null;
}

export function plansForGuide(guide) {
  return PLAN_PAGES.filter((p) => p.guide === guide);
}

export function planMeta(p) {
  return { title: `${p.title} · OpenExam Hub`, description: p.description };
}
