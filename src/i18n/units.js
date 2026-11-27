/**
 * English content units. A translation overlay is keyed by these ids and may replace only
 * the strings translatableEntries() collects. Head titles match routeMeta() exactly.
 */
import { examContent } from '../seo/examContent.js';
import { EXAM_PAGES, EXAMS_INDEX, PAGE_META, routeMeta } from '../seo/site.js';
import { PLAN_PAGES, planPath } from '../seo/planPages.js';
import { COMPARE_PAGES, COMPARE_HUB, CLB_TABLE_PAGE } from '../compare/comparePages.js';
import { FAQ, SOURCES } from '../landing/content.js';
import { AI_FRUGALITY_TITLE, AI_FRUGALITY_INTRO, AI_FRUGALITY_POINTS } from '../aiFrugality.js';
import { EXPENSES } from '../expenses.js';
import { TOOL_H1, TOOL_DESCRIPTION, TOOL_FAQ, TOOL_LABEL, TOOL_CHROME } from '../tools/clbContent.js';
import { CEFR_TOOL_H1, CEFR_TOOL_DESCRIPTION, CEFR_TOOL_FAQ, CEFR_CONVERTERS, CEFR_CHROME, TCF_CEFR } from '../tools/cefrData.js';
import { CRS_TOOL_H1, CRS_TOOL_DESCRIPTION, CRS_TOOL_FAQ, CRS_CHROME, CRS_FIRST_LANGUAGE_ROWS, CRS_SECOND_LANGUAGE_ROWS } from '../tools/crsLanguage.js';
import { TEST_FORMATS, FORMAT_ROW_LABELS, FRENCH_DIPLOMA_ROWS, GERMAN_EXAM_ROWS, IELTS_CEFR, CELPIP_CEFR, PTE_ACADEMIC_CEFR } from '../compare/compareData.js';
import { HOME, ABOUT, FUNDING } from '../landing/pages.js';
import { BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION } from '../blog/meta.js';

const cache = new Map();

function examUnit(slug) {
  const meta = routeMeta(`/exams/${slug}`);
  const page = EXAM_PAGES.find((p) => p.slug === slug);
  return {
    headTitle: meta.title,
    headDescription: meta.description,
    label: page.label,
    ...examContent(slug)
  };
}

function planUnit(plan) {
  const meta = routeMeta(planPath(plan));
  return { headTitle: meta.title, headDescription: meta.description, ...plan };
}

function compareUnit(page) {
  const meta = routeMeta(`/compare/${page.slug}`);
  return { headTitle: meta?.title || page.title, headDescription: meta?.description || page.description, ...page };
}

const BUILDERS = {
  'landing:home': () => ({
    headTitle: PAGE_META['/'].title,
    headDescription: PAGE_META['/'].description,
    ...HOME
  }),
  'landing:about': () => ({
    headTitle: PAGE_META['/about'].title,
    headDescription: PAGE_META['/about'].description,
    ...ABOUT
  }),
  'landing:faq': () => ({
    headTitle: PAGE_META['/faq'].title,
    headDescription: PAGE_META['/faq'].description,
    title: 'Fair questions',
    eyebrow: 'FAQ',
    intro: 'Something missing?',
    ask: 'Ask me directly',
    srTitle: 'Frequently asked questions',
    items: FAQ
  }),
  'landing:funding': () => ({
    headTitle: PAGE_META['/funding'].title,
    headDescription: PAGE_META['/funding'].description,
    ...FUNDING,
    frugality: { title: AI_FRUGALITY_TITLE, intro: AI_FRUGALITY_INTRO, points: AI_FRUGALITY_POINTS }
  }),
  'landing:expenses': () => ({
    entries: EXPENSES.map((e) => ({
      item: e.item,
      source: e.source,
      fxSource: e.fx?.source || ''
    }))
  }),
  'landing:sources': () => ({ groups: SOURCES }),
  'site:exams': () => {
    const meta = routeMeta('/exams');
    return {
      headTitle: meta.title,
      headDescription: meta.description,
      h1: 'Language exam guides',
      eyebrow: 'Exam guides'
    };
  },
  'site:blog': () => ({ headTitle: BLOG_INDEX_TITLE, headDescription: BLOG_INDEX_DESCRIPTION }),
  'compareData:shared': () => ({
    formats: TEST_FORMATS,
    rowLabels: FORMAT_ROW_LABELS.map(([id, label]) => ({ id, label })),
    frenchRows: FRENCH_DIPLOMA_ROWS.map(([id, label]) => ({ id, label })),
    germanRows: GERMAN_EXAM_ROWS.map(([id, label]) => ({ id, label })),
    eyebrow: 'Side-by-side comparison · Official sources',
    checked: 'Checked against canada.ca and the official test sites on',
    levelTitle: '{scheme} level by skill, side by side',
    rowBefore: 'Each row is one {scheme} level. Each cell is the score IRCC gives for that level on that test, copied from IRCC’s Express Entry language page (last modified ',
    rowAfter: '). ',
    tableNote: 'For IELTS and CELPIP, IRCC lists the score that earns each level; PTE Core rows are score ranges.',
    topLevel: '{scheme} 10 is the top level on IRCC’s tables.',
    testFormat: 'Test format',
    formatNote: 'From each test owner’s official page, for the version IRCC accepts for Express Entry. The validity row is IRCC’s rule.',
    formatRegion: 'Test format: {names}',
    formatCaption: 'Test format, from the official test websites',
    detail: 'Detail',
    cefrTitle: 'CEFR, as each test owner publishes it',
    cefrLead: 'CEFR is a different scale from CLB, and IRCC uses CLB for Express Entry. These are the test owners’ own CEFR tables, shown separately. They are not used to line the two tests up.',
    cefrHeading: '{exam} and the CEFR',
    cefrRegion: '{exam} to CEFR, as published by the test owner',
    cefrCol: 'CEFR',
    sourceWord: 'Source:',
    skillRegion: '{label}: IRCC {level} table, {names}',
    skillCaption: '{label}: score IRCC gives for each {level} level, {names}',
    joinAnd: ' and ',
    faq: 'Questions people ask',
    sources: 'Sources and disclaimer',
    disclaimer: 'OpenExam Hub is independent and not affiliated with IRCC or any test owner named on this page. This page is for information only and is not immigration advice, and it gives no score guarantees. IRCC and the test owners can change their tables, formats and rules at any time, so confirm on canada.ca and the official test site before you book or apply.',
    related: 'Related tools and guides',
    irccSource: 'IRCC: Express Entry, Language test results ({tests} tables, accepted tests)',
    listedKind: 'minimum score listed by IRCC',
    rangeKind: 'score range listed by IRCC'
  }),
  'tool:clb': () => {
    const meta = routeMeta('/tools/clb-converter');
    return { headTitle: meta.title, headDescription: meta.description, h1: TOOL_H1, label: TOOL_LABEL, description: TOOL_DESCRIPTION, faq: TOOL_FAQ, ...TOOL_CHROME };
  },
  'tool:crs': () => {
    const meta = routeMeta('/tools/crs-language-points');
    return {
      headTitle: meta.title,
      headDescription: meta.description,
      h1: CRS_TOOL_H1,
      description: CRS_TOOL_DESCRIPTION,
      faq: CRS_TOOL_FAQ,
      ...CRS_CHROME,
      firstLabels: CRS_FIRST_LANGUAGE_ROWS.map((r) => r.label),
      secondLabels: CRS_SECOND_LANGUAGE_ROWS.map((r) => r.label)
    };
  },
  'tool:cefr': () => {
    const meta = routeMeta('/tools/cefr-converter');
    return {
      headTitle: meta.title,
      headDescription: meta.description,
      h1: CEFR_TOOL_H1,
      description: CEFR_TOOL_DESCRIPTION,
      faq: CEFR_TOOL_FAQ,
      inputs: Object.values(CEFR_CONVERTERS).map((c) => c.input.label),
      gapNotes: [
        'IELTS’s pages put bands 7–8 at C1 and about band 9 at C2, but do not place 8.5.',
        'IELTS’s CEFR pages quoted here place bands 5.5 and above only.',
        'CELPIP’s chart starts at level 2 (A1).',
        'Pearson’s table covers 10 to 90.',
        'The grid starts at 101 points (A1).',
        'The grid starts at 1/20 (A1).'
      ],
      ...CEFR_CHROME,
      tables: Object.fromEntries([IELTS_CEFR, CELPIP_CEFR, PTE_ACADEMIC_CEFR, TCF_CEFR].map((table) => [table.id, {
        exam: table.exam,
        scoreLabel: table.scoreLabel,
        note: table.note,
        scores: table.rows.map((r) => r.score),
        sources: table.sources.map((s) => ({ url: s.url, label: s.label }))
      }]))
    };
  },
  'compare:hub': () => {
    const meta = routeMeta(COMPARE_HUB.path);
    return {
      headTitle: meta.title,
      headDescription: meta.description,
      ...COMPARE_HUB,
      eyebrow: 'Comparisons · Official sources',
      lead: 'IRCC accepts three English tests (IELTS General Training, CELPIP-General and PTE Core) and two French tests (TEF Canada and TCF Canada) for Express Entry. These pages line the tests up by the CLB or NCLC level IRCC gives each score, with test facts from the official test sites. Other pages compare French diplomas and German exams by CEFR level, using what the authorities that read them publish. None of them converts one test’s score into another’s.',
      toolTitle: 'Free tool',
      toolBefore: 'Have your scores already? The ',
      toolLink: 'CLB / NCLC score converter',
      toolAfter: ' gives your level per skill and your CRS language points from the same IRCC tables.',
      disclaimer: 'OpenExam Hub is independent and not affiliated with IRCC or any test owner named on this page. This page is for information only and is not immigration advice, and it gives no score guarantees. IRCC and the test owners can change their tables at any time, so confirm on canada.ca before you book or apply.'
    };
  },
  'compare:clb-equivalency-table': () => {
    const meta = routeMeta(CLB_TABLE_PAGE.path);
    return {
      headTitle: meta.title,
      headDescription: meta.description,
      ...CLB_TABLE_PAGE,
      eyebrow: 'Equivalency table · IRCC’s official tables',
      checkedBefore: 'Copied from IRCC’s Express Entry language page (last modified ',
      checkedMiddle: '). Tables last checked on canada.ca on',
      checkedAnd: ' and ',
      download: 'Download the table as CSV',
      sectionTitle: 'CLB / NCLC level by skill, all five tests',
      rowLine: '{label} ({scheme}): {kind}, checked {date}.',
      levelHeader: 'CLB / NCLC',
      convert: 'Convert your own scores',
      faqTitle: 'Questions people ask',
      sourcesTitle: 'Sources and disclaimer',
      sourceLabel: 'IRCC: Express Entry, Language test results (all five tables and the list of accepted tests)',
      disclaimer: 'OpenExam Hub is independent and not affiliated with IRCC or any test owner named on this page. This page is for information only and is not immigration advice, and it gives no score guarantees. IRCC and the test owners can change their tables at any time, so confirm on canada.ca before you book or apply.',
      relatedTitle: 'Side-by-side comparisons'
    };
  }
};

for (const page of EXAM_PAGES) BUILDERS[`exam:${page.slug}`] = () => examUnit(page.slug);
for (const plan of PLAN_PAGES) BUILDERS[`plan:${plan.guide}/${plan.slug}`] = () => planUnit(plan);
for (const page of COMPARE_PAGES) BUILDERS[`compare:${page.slug}`] = () => compareUnit(page);

export function unitIds() {
  return Object.keys(BUILDERS);
}

export function getEnglishUnit(id) {
  if (!BUILDERS[id]) return null;
  if (!cache.has(id)) cache.set(id, BUILDERS[id]());
  return cache.get(id);
}

export function metaUnitFor(path) {
  if (path === '/') return 'landing:home';
  if (path === '/about') return 'landing:about';
  if (path === '/faq') return 'landing:faq';
  if (path === '/funding') return 'landing:funding';
  if (path === '/exams') return 'site:exams';
  if (path === '/blog') return 'site:blog';
  if (path === '/tools/clb-converter') return 'tool:clb';
  if (path === '/tools/crs-language-points') return 'tool:crs';
  if (path === '/tools/cefr-converter') return 'tool:cefr';
  if (path === '/compare') return 'compare:hub';
  if (path === '/compare/clb-equivalency-table') return 'compare:clb-equivalency-table';
  let m = path.match(/^\/exams\/([a-z0-9-]+)$/);
  if (m) return `exam:${m[1]}`;
  m = path.match(/^\/exams\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (m) return `plan:${m[1]}/${m[2]}`;
  m = path.match(/^\/compare\/([a-z0-9-]+)$/);
  if (m) return `compare:${m[1]}`;
  return null;
}

/** Units that must be fresh before a locale URL of this path is emitted. */
export function unitsForPath(path) {
  const meta = metaUnitFor(path);
  if (!meta) return [];
  const ids = [meta];
  if (path === '/') ids.push('landing:faq', 'landing:sources');
  if (path === '/funding') ids.push('landing:expenses');
  if (path === '/compare' || path.startsWith('/compare/')) ids.push('compareData:shared');
  return ids;
}
