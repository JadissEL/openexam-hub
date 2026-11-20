/**
 * SEO metadata shared by the build-time prerender (Node) and the browser.
 * Plain data and pure functions only: no React, no JSON imports, no browser globals.
 */

export const SITE_ORIGIN = 'https://openexamhub.org';
export const SITE_NAME = 'OpenExam Hub';
export const REPO_URL = 'https://github.com/JadissEL/openexam-hub';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;

/**
 * Per-exam guide pages under /exams/<slug>. `tags` are the blog exam tags (lib/exams.js ids)
 * whose posts are listed on the page and whose blog posts link back to it.
 */
export const EXAM_PAGES = [
  {
    slug: 'tef-canada',
    label: 'TEF Canada',
    tags: ['TEF_CANADA', 'TEF'],
    title: 'TEF Canada: format, NCLC scores and free official practice',
    description:
      'TEF Canada explained from official sources: the four tests and their timings, how scores convert to NCLC for Express Entry, and free official sample papers from Le français des affaires (CCI Paris).'
  },
  {
    slug: 'tcf-canada',
    label: 'TCF Canada',
    tags: [],
    title: 'TCF Canada: format, timings and free official practice',
    description:
      'TCF Canada from official sources: four compulsory papers, timings and question counts from France Éducation international, how IRCC uses the results, and free official practice from TV5Monde and RFI.'
  },
  {
    slug: 'tcf',
    label: 'TCF tout public',
    tags: ['TCF'],
    title: 'TCF tout public: format, scoring and free official practice',
    description:
      'TCF tout public from official sources: the three compulsory papers and two optional ones, how each is scored on the CEFR scale, and free official practice from TV5Monde and RFI.'
  },
  {
    slug: 'ielts',
    label: 'IELTS',
    tags: ['IELTS'],
    title: 'IELTS: test format, band scores and free official practice tests',
    description:
      'IELTS Academic and General Training from official sources: the four sections and timings, the band-to-CEFR alignment, and free official practice tests from the British Council, IELTS.org and Cambridge.'
  },
  {
    slug: 'toefl',
    label: 'TOEFL iBT',
    tags: ['TOEFL'],
    title: 'TOEFL iBT (2026 format): sections and free official practice',
    description:
      'The TOEFL iBT as updated by ETS from 21 January 2026: section order, timings and task types, plus the free official ETS sample tests, full-length practice tests and scoring rubrics.'
  },
  {
    slug: 'delf',
    label: 'DELF and DALF',
    tags: ['DELF', 'DALF'],
    title: 'DELF and DALF (A1–C2): levels and free official sample papers',
    description:
      'DELF (A1–B2) and DALF (C1–C2) French diplomas from France Éducation international: what each level tests and where to find free official sample papers and listening practice.'
  },
  {
    slug: 'goethe',
    label: 'Goethe-Zertifikat',
    tags: ['GOETHE'],
    title: 'Goethe-Zertifikat A1–C2: free official practice tests',
    description:
      'Goethe-Zertifikat German exams from A1 to C2: the free official Goethe-Institut practice tests (Übungssätze) for every level, plus free self-study from DW and the VHS Lernportal.'
  },
  {
    slug: 'dele',
    label: 'DELE',
    tags: ['DELE'],
    title: 'DELE A1–C2: exam format by level and free official resources',
    description:
      'DELE Spanish diplomas from Instituto Cervantes: the papers and timings for each level from A1 to C2, how the diplomas are awarded, and the official exam information pages.'
  }
];

export function examPageBySlug(slug) {
  return EXAM_PAGES.find((p) => p.slug === slug) || null;
}

/** Exam guide pages that match a blog exam tag (e.g. 'TEF_CANADA' -> TEF Canada page). */
export function examPagesForTag(tag) {
  const t = String(tag || '').trim().toUpperCase();
  return EXAM_PAGES.filter((p) => p.tags.includes(t));
}

export const EXAMS_INDEX = {
  title: 'Language exam guides: TEF Canada, TCF, IELTS, TOEFL, DELF, Goethe, DELE',
  description:
    'Free guides to the main language exams for study, work and immigration: official formats and timings, how scores are reported, and free official practice material for each exam.'
};

/** Static routes and their head tags. Titles here are the full <title> text. */
export const PAGE_META = {
  '/': {
    title: 'OpenExam Hub · Free study plans for TEF Canada, TCF, IELTS, TOEFL, Goethe and DELE',
    description:
      'Free, day-by-day study plans for TEF Canada, TCF, IELTS, TOEFL, Goethe and DELE, built only from official free resources. Free. Create a free account to generate your plan. Code public on GitHub.'
  },
  '/app': {
    title: 'Study planner · OpenExam Hub',
    description:
      'Pick your exam, level and date to get a free day-by-day study plan that links only to official, free practice material. Free account, no paywall.'
  },
  '/about': {
    title: 'About OpenExam Hub · A free, open-source exam study planner',
    description:
      'Why OpenExam Hub exists, who builds it, and how it turns free official material from exam bodies and public broadcasters into a study plan. Independent and open source.'
  },
  '/faq': {
    title: 'FAQ · Is OpenExam Hub free? Which exams are covered? · OpenExam Hub',
    description:
      'Straight answers about OpenExam Hub: what it costs, which exams it covers, whether you need an account, how plans are made, and how it is funded.'
  },
  '/funding': {
    title: 'How OpenExam Hub is funded · Open books, no paywall',
    description:
      'OpenExam Hub is free with no paywall. See how it is funded through donations and a few dashboard ads, and the published income and expenses.'
  },
  '/privacy': {
    title: 'Privacy policy · OpenExam Hub',
    description: 'What OpenExam Hub stores, why, for how long, and how to delete your data.'
  },
  '/terms': {
    title: 'Terms of use · OpenExam Hub',
    description: 'The terms for using OpenExam Hub, a free and independent study planner for language exams.'
  },
  '/exams': EXAMS_INDEX
};

export function normalizePath(pathname) {
  return String(pathname || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

/** Head tags for a non-blog route, or null when the route is unknown. */
export function routeMeta(pathname) {
  const p = normalizePath(pathname);
  if (PAGE_META[p]) {
    return { ...PAGE_META[p], canonical: p === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${p}` };
  }
  const m = p.match(/^\/exams\/([a-z0-9-]+)$/);
  const page = m && examPageBySlug(m[1]);
  if (page) {
    return { title: `${page.title} · OpenExam Hub`, description: page.description, canonical: `${SITE_ORIGIN}${p}` };
  }
  return null;
}

/** Every indexable non-blog path, in sitemap order. */
export function indexablePaths() {
  return [...Object.keys(PAGE_META), ...EXAM_PAGES.map((p) => `/exams/${p.slug}`)];
}

// ---------------------------------------------------------------- JSON-LD

export const ORG_ID = `${SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icon-512.png`, width: 512, height: 512 },
    email: 'hello@openexamhub.org',
    sameAs: [REPO_URL]
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    inLanguage: 'en',
    publisher: { '@id': ORG_ID }
  };
}

/** items: [{ name, path }] from the home page down to the current page. */
export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${item.path}`
    }))
  };
}

/** Only for Q&A that is visible on the same page. */
export function faqPageJsonLd(faq) {
  if (!faq?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };
}
