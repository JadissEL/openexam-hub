// Single source of truth for marketing copy that must stay factual.
// If something here stops being true in the code, change it here.

export const CONTACT_EMAIL = 'elantaki.dijadiss@gmail.com';
export const REPO_URL = 'https://github.com/JadissEL/openexam-hub';
export const APP_PATH = '/app';

// Only organisations whose pages are actually in the seeded library (scripts/seed-library.js).
// Names only: we link to them, we are not affiliated with them.
export const SOURCES = [
  {
    exam: 'TCF',
    language: 'French',
    orgs: [
      { name: 'France Éducation international', note: 'the body that runs the TCF', url: 'https://www.france-education-international.fr/test/tcf-tout-public' },
      { name: 'TV5Monde', note: 'Apprendre le français', url: 'https://apprendre.tv5monde.com/fr' },
      { name: 'RFI', note: 'Français facile', url: 'https://francaisfacile.rfi.fr/fr/' }
    ]
  },
  {
    exam: 'IELTS',
    language: 'English',
    orgs: [
      { name: 'IELTS.org', note: 'official exam information', url: 'https://ielts.org' },
      { name: 'British Council', note: 'free practice tests', url: 'https://takeielts.britishcouncil.org' },
      { name: 'Cambridge English', note: 'sample tests', url: 'https://www.cambridgeenglish.org' }
    ]
  },
  {
    exam: 'Goethe',
    language: 'German',
    orgs: [
      { name: 'Goethe-Institut', note: 'the body that runs the Goethe exams', url: 'https://www.goethe.de/de/spr/prf.html' },
      { name: 'DW', note: 'Learn German', url: 'https://learngerman.dw.com' },
      { name: 'VHS Lernportal', note: 'free self-study courses', url: 'https://www.vhs-lernportal.de' }
    ]
  }
];

export const FAQ = [
  {
    q: 'Is it really free? What’s the catch?',
    a: 'There is no paid tier and no paywall, and we don’t sell data. Running it costs money (hosting and AI calls). It’s funded openly by donations and, on the study dashboard only, a few ads. Every euro from both is shown publicly, and once the next 5 years of running costs are covered, the ads go away. This page will never show ads.'
  },
  {
    q: 'Do I need an account?',
    a: 'No. You can build and follow a plan straight away as a guest. Create a free account (email or Google) only if you want your plans and ticks on more than one device.'
  },
  {
    q: 'Which exams are covered?',
    a: 'Right now: TCF (French), IELTS (English) and the Goethe-Zertifikat exams (German), for levels A2 to C1. More exams will come once we have good official material to point to.'
  },
  {
    q: 'Do you host or copy exam papers?',
    a: 'No. We link to pages that the exam bodies and public broadcasters already publish for free, and we check those links regularly. We never re-upload their material.'
  },
  {
    q: 'Are you affiliated with France Éducation international, IELTS or the Goethe-Institut?',
    a: 'No. OpenExam Hub is an independent project. We are not affiliated with, endorsed by or sponsored by any exam body or publisher we link to.'
  },
  {
    q: 'Will a plan guarantee that I pass?',
    a: 'No tool can promise that. A plan gives you structure and good material; the practice is still yours. If you can afford it, an official mock exam at a test centre is worth doing before the real one.'
  },
  {
    q: 'How are plans made? Is it AI?',
    a: 'Partly. A set of rules picks resources and paces the work to your level and exam date, and an AI model can help write the day-by-day tasks. Every link must come from an allowlist of official websites and passes an automatic check before it is shown. When the AI isn’t available, you still get a plan from the built-in rules.'
  },
  {
    q: 'I found a broken link or a mistake. What do I do?',
    a: `Email ${'elantaki.dijadiss@gmail.com'} or open an issue on GitHub. A real person reads both.`
  }
];
