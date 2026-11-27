/**
 * Visible copy for the home, about and funding pages. English is the source.
 * Locale overlays replace these strings; they do not carry a second copy of any figure.
 */

export const HOME = {
  eyebrow: 'Free study plans · TEF Canada · TCF · IELTS · TOEFL · CELPIP · Goethe · DELE',
  h1Before: 'Prepare for your language exam',
  h1Em: 'without',
  h1After: 'paying for a course.',
  lead: 'OpenExam Hub started at our kitchen table, while my wife was preparing for her language certification exams. It turns the free material that exam bodies already publish into a calm, day-by-day plan.',
  cta: 'Build my free plan',
  seeHow: 'See how it works',
  heroAltDesk: 'Screenshot of a 30-day TCF B2 plan in OpenExam Hub: three official resources with verified links, and a checklist with a progress coach.',
  heroAltPhone: 'Screenshot of the plan builder on a phone: pick your exam, target level and days until the exam.',
  freeLine: 'Free. Create a free account to generate your plan. Open source (MIT).',
  learnersFirst: 'Be one of the first learners.',
  learnersJoin: 'Join {count} learners.',
  howEyebrow: 'See how it works',
  howTitle: 'Three choices, then a plan you can actually follow.',
  howLead: 'A 75-second walkthrough, from creating a free account to building a plan.',
  videoLabel: 'OpenExam Hub demo: signing up and building a TEF Canada plan',
  captions: 'English captions are available in the player. Background music: “Everyone is so alive” by Loyalty Freak Music, released under CC0 1.0.',
  steps: [
    {
      title: 'Tell it about your exam',
      body: 'Choose TEF Canada, TCF, IELTS, TOEFL, CELPIP, Goethe or DELE, the level you’re aiming for (A1 to C2) and how many days you have. Not sure of your level? There’s a short placement check.'
    },
    {
      title: 'Get a day-by-day plan',
      body: 'You get phases and daily tasks, each pointing to a free page from an official source. Every link is checked automatically, and its status is shown right next to it.'
    },
    {
      title: 'Tick things off, adjust as you go',
      body: 'Ticks are saved as you go. If you fall behind, the progress coach re-paces the rest of the plan. You can also export your plan as Markdown or JSON.'
    }
  ],
  examsEyebrow: 'Exams and sources',
  examsTitle: 'TEF Canada, TCF, IELTS, TOEFL, CELPIP, Goethe and DELE. Only official, free sources.',
  examsLead: 'These are the organisations whose free pages are in our library today. We link; we never copy. Plans can only point to websites on an allowlist, and links are re-checked every night.',
  guidesTitle: 'Free exam guides',
  guidesLead: 'Format, timings, scoring and the free official practice material for each exam, all in one place.',
  guideSuffix: 'guide',
  allGuides: 'All exam guides',
  independent: 'OpenExam Hub is independent. We are not affiliated with, endorsed by or sponsored by any of these organisations. Their names are used only to tell you where a link leads.',
  newTab: '(opens the official site in a new tab)',
  faqEyebrow: 'Questions',
  faqTitle: 'Common questions',
  faqAll: 'Read all the questions and answers',
  ctaTitle: 'Your exam date is set. Make the weeks before it calmer.',
  ctaLead: 'Three choices and you have a plan. Free. Create a free account to generate yours — no card needed.'
};

export const ABOUT = {
  title: 'About OpenExam Hub',
  eyebrow: 'The project',
  intro: 'A family project that turns official free exam material into a day-by-day study plan.',
  todayLabel: 'Where the project is today',
  todayEyebrow: 'Where we are today',
  today: 'OpenExam Hub is new. We don’t have thousands of users or press quotes to show you, and we won’t make them up. What we can show you is how it works, where every resource comes from, and the code itself.',
  whoEyebrow: 'Who’s behind this',
  whoTitle: 'A family project, not a startup.',
  p1: 'OpenExam Hub started at our kitchen table when my wife was preparing for her language certification exams. We saw first-hand how stressful it is to hunt for reliable study material without getting pulled into expensive coaching agencies or ending up on broken links.',
  p2: 'The strange part is that the good material already exists. The CCI Paris, France Éducation international, ETS, Paragon Testing Enterprises, Instituto Cervantes, the Goethe-Institut, the British Council and public broadcasters publish free sample papers and practice for these exams. It is just scattered across dozens of pages, in different languages, with no plan attached.',
  p3: 'So we built the tool we wished we’d had: pick your exam, your level and your date, and get a schedule that points only to those official, free pages. No paywall, now or later. Free. Create a free account to generate your plan.',
  role: 'Built OpenExam Hub · {write}',
  roleWrite: 'write to me',
  peekEyebrow: 'What you actually get',
  peekTitle: 'Real resources, checked every night.',
  peekBody: 'This is the real library inside the app. Every resource shows which official site it comes from, whether its link was reachable, and the date it was last checked.',
  peekCta: 'Open the planner',
  peekAlt: 'Screenshot of the OpenExam Hub library for TCF: France Éducation international, TV5Monde and RFI, each marked ‘official domain, link checked, reachable’ with the date of the last check.',
  codeEyebrow: 'Built in the open',
  codeTitle: 'Don’t take our word for it. Read the code.',
  codeBody: 'Everything on this site can be checked: the resource allowlist, the link checker, how plans are paced, and exactly what is stored in the database. The full source code is on GitHub under the MIT licence, and issues and suggestions for new official resources are welcome.',
  moreTitle: 'More to read',
  moreBody: 'Questions about what OpenExam Hub costs, which exams it covers, and how plans are made are answered on the {faq}. Guides on exam scores, fees and requirements are on the {blog}.',
  moreFaq: 'FAQ',
  moreBlog: 'blog'
};

export const FUNDING = {
  title: 'How the lights stay on',
  eyebrow: 'Funding and ads',
  intro: 'Free forever. Funded openly by donations and a few dashboard ads, which go away once the next 5 years are covered.',
  h2: 'How OpenExam Hub is funded',
  body: 'The expensive part of exam prep is usually the course, not the content. We skip the course. What’s left is hosting and AI calls for writing plans. Ads appear only on the study dashboard, never on the landing page. Earnings from ads and donations, and the project’s expenses, are published so anyone can see what we take in and what we spend.',
  promises: [
    ['No paywall', 'Every feature is free, forever. There is no premium tier waiting behind it.'],
    ['Open books', 'Every euro from donations and dashboard ads, and every recorded expense, is shown publicly, so you can see exactly how the site is paid for.'],
    ['No selling data', 'We don’t sell or rent personal data, and never will.']
  ],
  more: 'Questions about cost, accounts and ads are also on the {faq}. For exam scores, fees and requirements, see the {blog}.',
  moreFaq: 'FAQ',
  moreBlog: 'blog',
  planner: 'The live totals are also on the Transparency tab inside the {planner} (free account).',
  plannerLink: 'planner'
};
