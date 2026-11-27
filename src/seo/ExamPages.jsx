import React from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { EXAM_PAGES, indefiniteArticle } from './site.js';
import { planPage, planPath, plansForGuide } from './planPages.js';
import { toolPathForGuide } from '../tools/clbContent.js';
import { useHref, useLocale, useT, useUnit } from '../i18n/LocaleContext.jsx';
import { isPagePublished, localizedUnit } from '../i18n/publish.js';
import { localeMeta } from '../i18n/locales.js';

const arrow = 'w-4 h-4 rtl:-scale-x-100';

function formatDate(iso, locale) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeMeta(locale || 'en').dateLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Breadcrumbs({ items }) {
  const href = useHref();
  return (
    <nav aria-label="Breadcrumb" className="text-[14px] text-[#6B635A]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => (
          <li key={item.path} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {i === items.length - 1 ? (
              <span aria-current="page">{item.name}</span>
            ) : (
              <a href={href(item.path)} className="text-[#C2410C] underline underline-offset-4">{item.name}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function examBreadcrumbs(page, names = {}) {
  const items = [
    { name: names.home || 'Home', path: '/' },
    { name: names.exams || 'Exams', path: '/exams' }
  ];
  if (page) items.push({ name: page.label, path: `/exams/${page.slug}` });
  return items;
}

function relatedPosts(posts, tags) {
  return (posts || []).filter((p) => !p.draft && (p.exams || []).some((e) => tags.includes(e)));
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className={`font-display ${ink} text-[28px] sm:text-[34px] tracking-[-0.02em] font-medium`}>
      {children}
    </h2>
  );
}

function FormatTable({ format, label }) {
  const t = useT();
  if (!format?.sections?.length) return null;
  return (
    <section aria-labelledby="format-title" className="mt-14">
      <SectionTitle id="format-title">{t('section.format')}</SectionTitle>
      <div
        className="mt-5 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2"
        tabIndex={0}
        role="region"
        aria-label={t('exam.formatRegion', { label })}
      >
        <table className="w-full text-left text-[15px] leading-snug">
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">{t('exam.paper')}</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{t('exam.time')}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{t('exam.items')}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{t('exam.involves')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1D7]">
            {format.sections.map((s) => (
              <tr key={s.name}>
                <th scope="row" className={`px-4 py-3 font-semibold ${ink} align-top`}>{s.name}</th>
                <td className="px-4 py-3 align-top whitespace-nowrap">{s.duration}</td>
                <td className="px-4 py-3 align-top">{s.items}</td>
                <td className={`px-4 py-3 align-top ${muted}`}>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {format.scoring ? <p className={`mt-5 text-[16px] leading-[1.7] ${muted} max-w-3xl`}><strong className={ink}>{t('exam.scoring')}</strong> {format.scoring}</p> : null}
      {format.notes ? <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>{format.notes}</p> : null}
      {format.sourceUrl ? (
        <p className="mt-3 text-[14px] text-[#6B635A]">
          {t('exam.source')} <a href={format.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-all">{format.sourceUrl}</a>
        </p>
      ) : null}
    </section>
  );
}

function DeleLevels({ rows, scoring }) {
  const t = useT();
  if (!rows?.length) return null;
  return (
    <section aria-labelledby="levels-title" className="mt-14">
      <SectionTitle id="levels-title">{t('section.levels')}</SectionTitle>
      <div
        className="mt-5 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2"
        tabIndex={0}
        role="region"
        aria-label={t('exam.deleTable')}
      >
        <table className="w-full text-left text-[15px] leading-snug">
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">{t('exam.level')}</th>
              <th scope="col" className="px-4 py-3 font-semibold">{t('exam.papers')}</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{t('exam.examTime')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1D7]">
            {rows.map((r) => (
              <tr key={r.level}>
                <th scope="row" className={`px-4 py-3 font-semibold ${ink} align-top`}>DELE {r.level}</th>
                <td className={`px-4 py-3 align-top ${muted}`}>{r.sections.join(' · ')}</td>
                <td className="px-4 py-3 align-top whitespace-nowrap">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-[14px] text-[#6B635A] max-w-3xl`}>
        {t('exam.deleNote')}
      </p>
      {scoring ? <p className={`mt-5 text-[16px] leading-[1.7] ${muted} max-w-3xl`}><strong className={ink}>{t('exam.result')}</strong> {scoring}</p> : null}
    </section>
  );
}

function Resources({ groups, lastChecked }) {
  const t = useT();
  const locale = useLocale();
  if (!groups?.length) return null;
  const checked = formatDate(lastChecked, locale);
  return (
    <section aria-labelledby="resources-title" className="mt-14">
      <SectionTitle id="resources-title">{t('section.resources')}</SectionTitle>
      <p className={`mt-3 text-[16px] ${muted} max-w-3xl`}>
        {t('exam.resourcesLead')}
        {checked ? ` ${t('exam.linksChecked', { date: checked })}` : ''}
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.category}>
            <h3 className={`text-[13px] font-semibold uppercase tracking-[0.14em] text-[#9A3412]`}>{g.category}</h3>
            <ul className="mt-3 space-y-3 text-[16px] leading-snug">
              {g.items.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">
                    {r.title}
                  </a>
                  <span className="block text-[14px] text-[#6B635A]">
                    {r.org}{r.levels?.length ? ` · ${r.levels.join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const TOOL_GUIDES = ['tef-canada', 'tcf-canada', 'ielts', 'celpip'];

/** Free-tool card on the TEF Canada, TCF Canada, IELTS and CELPIP guides (deep-links the matching converter tab). */
// Side-by-side /compare pages (src/compare/comparePages.js) linked from the English guide cards.
const CRS_LINK = { href: '/tools/crs-language-points', label: 'CRS points for your first and second official language' };
const GUIDE_COMPARE_LINKS = {
  ielts: [
    { href: '/compare/ielts-vs-celpip', label: 'IELTS vs CELPIP: CLB scores and test format' },
    { href: '/compare/ielts-vs-pte', label: 'IELTS vs PTE Core: CLB scores and test format' },
    { href: '/tools/cefr-converter', label: 'IELTS band to CEFR level, from IELTS’s own table' },
    CRS_LINK
  ],
  celpip: [
    { href: '/compare/ielts-vs-celpip', label: 'IELTS vs CELPIP: CLB scores and test format' },
    { href: '/compare/celpip-vs-pte', label: 'CELPIP vs PTE Core: CLB scores and test format' },
    { href: '/tools/cefr-converter?tab=celpip', label: 'CELPIP level to CEFR level, from CELPIP’s chart' },
    CRS_LINK
  ],
  'tef-canada': [
    { href: '/compare/tef-vs-tcf', label: 'TEF Canada vs TCF Canada: NCLC scores side by side' },
    CRS_LINK
  ],
  'tcf-canada': [
    { href: '/compare/tef-vs-tcf', label: 'TEF Canada vs TCF Canada: NCLC scores side by side' },
    { href: '/tools/cefr-converter?tab=tcf', label: 'TCF score to CEFR level (Campus France’s TCF grid)' },
    CRS_LINK
  ]
};

// Guides without the converter card get a short list of the relevant compare pages and tools.
const GUIDE_TOOL_LINKS = {
  tcf: [
    { href: '/compare/delf-vs-tcf', label: 'DELF vs TCF: levels, validity and where each is accepted' },
    { href: '/tools/cefr-converter?tab=tcf', label: 'TCF score to CEFR level (Campus France’s TCF grid)' },
    { href: '/compare/tef-vs-tcf', label: 'Applying to Canada? TEF Canada vs TCF Canada, by NCLC' }
  ],
  delf: [
    { href: '/compare/delf-vs-tcf', label: 'DELF vs TCF: levels, validity and where each is accepted' },
    { href: '/compare/tef-vs-tcf', label: 'For Express Entry: TEF Canada vs TCF Canada, by NCLC' },
    CRS_LINK
  ],
  goethe: [{ href: '/compare/goethe-vs-telc', label: 'Goethe vs telc: German exams by CEFR level, and what BAMF and DAAD accept' }],
  telc: [{ href: '/compare/goethe-vs-telc', label: 'Goethe vs telc: German exams by CEFR level, and what BAMF and DAAD accept' }]
};

function GuideToolLinks({ guide }) {
  const t = useT();
  const href = useHref();
  const links = GUIDE_TOOL_LINKS[guide];
  if (!links) return null;
  return (
    <section aria-labelledby="guide-tools-title" className="mt-14 rounded-2xl border border-[#E7E1D7] bg-white/70 p-6 max-w-3xl">
      <p className={eyebrow}>{t('section.compare')}</p>
      <h2 id="guide-tools-title" className={`mt-2 font-display ${ink} text-[22px] sm:text-[26px] tracking-[-0.02em] font-medium`}>
        {t('section.sideBySide')}
      </h2>
      <ul className="mt-4 space-y-2 text-[16px] leading-snug">
        {links.map((l) => (
          <li key={l.href}>
            <a href={href(l.href)} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{l.label}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RelatedTool({ guide }) {
  const t = useT();
  const href = useHref();
  if (!TOOL_GUIDES.includes(guide)) return null;
  const name = { 'tcf-canada': 'TCF Canada', ielts: 'IELTS', celpip: 'CELPIP' }[guide] || 'TEF Canada';
  const scheme = (guide === 'ielts' || guide === 'celpip') ? 'CLB' : 'NCLC';
  return (
    <section aria-labelledby="related-tool-title" className="mt-14 rounded-2xl border border-[#E7C9B4] bg-[#FBF1E9] p-6">
      <p className={eyebrow}>{t('section.freeTool')}</p>
      <h2 id="related-tool-title" className={`mt-2 font-display ${ink} text-[24px] sm:text-[28px] tracking-[-0.02em] font-medium`}>
        Convert your {name} scores to {scheme}
      </h2>
      <p className={`mt-3 text-[16px] leading-[1.65] ${muted} max-w-2xl`}>
        Enter your four scores and see your CLB (NCLC) level per skill, whether you meet level 7 or 9, and your CRS language points, using IRCC’s official tables.{guide === 'ielts' ? ' Express Entry accepts IELTS General Training only, not Academic.' : guide === 'celpip' ? ' Express Entry accepts the CELPIP-General test.' : ''} No score guarantees, no account needed.
      </p>
      <a href={href(toolPathForGuide(guide))} className="mt-4 inline-flex items-center gap-1.5 font-semibold text-[#C2410C] underline underline-offset-4">
        Open the CLB / NCLC score converter <ArrowRight className={arrow} aria-hidden="true" />
      </a>
      {GUIDE_COMPARE_LINKS[guide] ? (
        <ul className="mt-4 space-y-2 text-[16px] leading-snug">
          {GUIDE_COMPARE_LINKS[guide].map((l) => (
            <li key={l.href}>
              <a href={href(l.href)} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{l.label}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Faq({ faq }) {
  const t = useT();
  const href = useHref();
  if (!faq?.length) return null;
  return (
    <section aria-labelledby="exam-faq-title" className="mt-14">
      <SectionTitle id="exam-faq-title">{t('section.faq')}</SectionTitle>
      <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7] max-w-3xl">
        {faq.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className={`cursor-pointer list-none font-semibold text-[17px] sm:text-lg ${ink} [&::-webkit-details-marker]:hidden flex items-start justify-between gap-4`}>
              {item.q}
              <span className="text-[#C2410C] group-open:rotate-45 transition-transform text-xl leading-none" aria-hidden="true">+</span>
            </summary>
            <p className={`mt-3 pr-8 text-[16px] leading-[1.7] ${muted}`}>{item.a}</p>
          </details>
        ))}
      </div>
      <p className={`mt-4 text-[16px] ${muted}`}>
        {t('tool.moreFaq')} <a href={href('/faq')} className="text-[#C2410C] underline underline-offset-4">{t('tool.fullFaq')}</a>.
      </p>
    </section>
  );
}

function PlannerCta({ planner, label, relatedPlanner }) {
  const t = useT();
  const href = useHref();
  const cta = planner || relatedPlanner;
  return (
    <section aria-labelledby="plan-title" className="mt-14 rounded-3xl bg-[#1A1714] text-white px-6 sm:px-8 py-8 sm:py-10">
      <h2 id="plan-title" className="font-display text-[28px] sm:text-[32px] tracking-[-0.02em] font-medium">
        {planner
          ? `Turn this into ${indefiniteArticle(planner.label)} ${planner.label} study plan`
          : `Personalised ${label} plans are coming soon`}
      </h2>
      <p className="mt-3 text-[16px] sm:text-[17px] leading-relaxed text-[#D9D2C8] max-w-xl">
        {planner
          ? 'OpenExam Hub builds a free day-by-day plan from official, free material like the links on this page. Pick your level and exam date. Free account, no paywall.'
          : relatedPlanner
            ? `The official material above is free to use now. Until a ${label} plan is ready, you can build a ${relatedPlanner.label} plan — it uses many of the same official sources.`
            : `The planner doesn’t cover ${label} yet. The official material above is free to use now.`}
      </p>
      <a
        href={href(cta ? `/app?exam=${encodeURIComponent(cta.exam)}` : '/app')}
        className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold"
      >
        {planner ? t('exam.buildPlan', { label: planner.label }) : relatedPlanner ? t('exam.buildPlan', { label: relatedPlanner.label }) : t('exam.openPlanner')} <ArrowRight className={arrow} aria-hidden="true" />
      </a>
    </section>
  );
}

/** Short "comparing tests" pointers between related exam guides. */
const COMPARE = {
  ielts: [
    {
      lead: 'Some universities and employers accept the TOEFL iBT as well as IELTS. ETS changed the TOEFL iBT format on 21 January 2026; see the',
      slug: 'toefl',
      anchor: 'TOEFL iBT 2026 format guide and free ETS practice',
      tail: 'Always check which tests your university or immigration programme accepts.'
    },
    {
      lead: 'Applying to Canada through Express Entry? IRCC also accepts the CELPIP-General test. See the',
      slug: 'celpip',
      anchor: 'CELPIP guide: test format, CLB scores and free official practice',
      tail: 'Confirm which tests your programme accepts on canada.ca.'
    }
  ],
  toefl: [
    {
      lead: 'Not sure which English test to take? Compare with the',
      slug: 'ielts',
      anchor: 'IELTS format and free official practice guide',
      tail: 'Check which tests your university or immigration programme accepts before you book.'
    }
  ],
  tcf: [
    {
      lead: 'TCF tout public is not the test IRCC lists for Express Entry. For Canadian economic immigration you need TCF Canada. Convert TCF Canada scores with the',
      href: '/tools/clb-converter?tab=tcf',
      anchor: 'CLB / NCLC score converter',
      tail: 'It uses IRCC’s official tables and does not convert TCF tout public scores.'
    }
  ],
  delf: [
    {
      lead: 'DELF and DALF are not on IRCC’s Express Entry language-test list; IRCC names TEF Canada and TCF Canada for that programme. Convert TEF Canada or TCF Canada scores with the',
      href: '/tools/clb-converter',
      anchor: 'CLB / NCLC score converter',
      tail: 'It uses IRCC’s official tables. For Canadian citizenship, IRCC’s language-proof page accepts a DELF at B1 or higher and any DALF result; always confirm on canada.ca.'
    }
  ],
  goethe: [
    {
      lead: 'telc gGmbH also runs German exams at CEFR levels, including telc Deutsch C1 Hochschule, which telc describes as an exam for university admission. See the',
      slug: 'telc',
      anchor: 'telc official practice tests and handbooks',
      tail: 'Always check which certificate your university, employer or mission will accept.'
    }
  ],
  telc: [
    {
      lead: 'The Goethe-Institut also runs German exams from A1 to C2. See the',
      slug: 'goethe',
      anchor: 'Goethe-Zertifikat official practice guide',
      tail: 'Always check which certificate your university, employer or mission will accept.'
    }
  ]
};

/**
 * Contextual pointers from an exam guide to the blog comparison posts (matched by slug). A link is only
 * rendered when the post exists and is published, so a renamed or unpublished post never leaves a dead link.
 * `anchor` is the visible link text; keep it in step with the post title.
 */
const POST_NOTES = {
  ielts: [
    {
      slug: 'toefl-vs-ielts',
      lead: 'Choosing between the two tests? Read',
      anchor: 'TOEFL vs IELTS in 2026: which English test should you take?',
      tail: 'for format, scoring and acceptance.'
    },
    {
      slug: 'ielts-to-cefr',
      lead: 'For the CEFR side, see',
      anchor: 'IELTS to CEFR: which IELTS band matches B1, B2, C1 and C2',
      tail: 'for what IELTS.org says about bands and levels.'
    },
    {
      slug: 'ielts-to-clb-express-entry',
      lead: 'Applying to Canada through Express Entry? See',
      anchor: 'IELTS to CLB for Express Entry',
      tail: 'for IRCC’s official IELTS General Training to CLB table and what CLB 7 requires in each skill.'
    }
  ],
  toefl: [
    {
      slug: 'toefl-vs-ielts',
      lead: 'Read our comparison',
      anchor: 'TOEFL vs IELTS in 2026: which English test should you take?',
      tail: 'for format, scoring and why TOEFL is not on IRCC’s Express Entry list.'
    }
  ],
  delf: [
    {
      slug: 'delf-vs-tcf-which-french-test',
      lead: 'Weighing DELF against TCF? See',
      anchor: 'DELF vs TCF: which French test should you take?',
      tail: 'for what the French government, universities and IRCC accept.'
    }
  ],
  tcf: [
    {
      slug: 'delf-vs-tcf-which-french-test',
      lead: 'Weighing TCF against DELF? See',
      anchor: 'DELF vs TCF: which French test should you take?',
      tail: 'for what the French government, universities and IRCC accept.'
    }
  ],
  'tcf-canada': [
    {
      slug: 'delf-vs-tcf-which-french-test',
      lead: 'Also considering a French diploma? See',
      anchor: 'DELF vs TCF: which French test should you take?',
      tail: 'for how the two compare for citizenship, study and Canadian immigration.'
    }
  ],
  'tef-canada': [
    {
      slug: 'delf-vs-tcf-which-french-test',
      lead: 'Comparing a lifetime diploma with a scored test? See',
      anchor: 'DELF vs TCF: which French test should you take?',
      tail: 'for what the French government, universities and IRCC accept. IRCC’s Express Entry list names TEF Canada and TCF Canada, not the DELF.'
    }
  ],
  goethe: [
    {
      slug: 'german-exams-visa-university-professional-recognition',
      lead: 'Choosing a German exam for a visa, a degree or professional recognition? See',
      anchor: 'Which German exam you need for a visa, university or professional recognition',
      tail: 'for official CEFR levels and accepted exams, including Goethe-Zertifikat and telc Deutsch C1 Hochschule.'
    }
  ],
  telc: [
    {
      slug: 'german-exams-visa-university-professional-recognition',
      lead: 'For how German authorities and universities treat telc certificates, see',
      anchor: 'Which German exam you need for a visa, university or professional recognition',
      tail: 'It cites official sources on visas, university admission (including telc Deutsch C1 Hochschule) and naturalisation.'
    }
  ]
};

/**
 * Contextual pointers from a study-plan page to a relevant blog post (matched by slug).
 * A link is only rendered when the post exists and is published.
 */
const PLAN_POST_NOTES = {
  'ielts/8-week-study-plan': [
    {
      slug: 'ielts-to-cefr',
      lead: 'This plan works toward an overall IELTS 6.5. For how overall bands relate to CEFR levels, see',
      anchor: 'IELTS to CEFR: which IELTS band matches B1, B2, C1 and C2',
      tail: 'IELTS treats 6.5 as borderline between B2 and C1.'
    },
    {
      slug: 'ielts-to-clb-express-entry',
      lead: 'If you need IELTS for Express Entry, IRCC uses its own CLB table, not the CEFR mapping. See',
      anchor: 'IELTS to CLB for Express Entry',
      tail: 'Express Entry accepts IELTS General Training only, not Academic.'
    }
  ],
  'tcf/b2-30-day-study-plan': [
    {
      slug: 'delf-vs-tcf-which-french-test',
      lead: 'Still choosing between a TCF attestation and a DELF diploma? See',
      anchor: 'DELF vs TCF: which French test should you take?',
      tail: 'This plan is for TCF tout public, not TCF Canada or the DELF.'
    }
  ]
};

function planPostNotesFor(plan, posts = []) {
  const key = `${plan.guide}/${plan.slug}`;
  return (PLAN_POST_NOTES[key] || [])
    .map((n) => ({ ...n, post: posts.find((p) => p.slug === n.slug && !p.draft) }))
    .filter((n) => n.post);
}

function PlanPostNotes({ plan, posts = [] }) {
  const href = useHref();
  const notes = planPostNotesFor(plan, posts);
  if (!notes.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {notes.map((n) => (
        <p key={n.slug} className={`text-[16px] leading-[1.7] ${muted}`}>
          {n.lead} <a href={href(n.post.url)} className="text-[#C2410C] underline underline-offset-4">{n.anchor}</a>. {n.tail}
        </p>
      ))}
    </div>
  );
}

function compareNotesFor(guide) {
  const raw = COMPARE[guide];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function CompareNote({ guide, posts = [] }) {
  const t = useT();
  const href = useHref();
  const compares = compareNotesFor(guide);
  const notes = (POST_NOTES[guide] || [])
    .map((n) => ({ ...n, post: posts.find((p) => p.slug === n.slug && !p.draft) }))
    .filter((n) => n.post);
  if (!compares.length && !notes.length) return null;
  return (
    <section aria-label={t('exam.comparing')} className="mt-10 max-w-3xl space-y-3">
      {compares.map((c) => {
        const to = c.href || `/exams/${c.slug}`;
        return (
          <p key={to} className={`text-[16px] leading-[1.7] ${muted}`}>
            {c.lead} <a href={href(to)} className="text-[#C2410C] underline underline-offset-4">{c.anchor}</a>. {c.tail}
          </p>
        );
      })}
      {notes.map((n) => (
        <p key={n.slug} className={`text-[16px] leading-[1.7] ${muted}`}>
          {n.lead} <a href={href(n.post.url)} className="text-[#C2410C] underline underline-offset-4">{n.anchor}</a> {n.tail}
        </p>
      ))}
    </section>
  );
}

function RelatedReading({ posts, related }) {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  return (
    <section aria-labelledby="related-title" className="mt-14 grid gap-10 md:grid-cols-2">
      <div>
        <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{t('section.fromBlog')}</h2>
        {posts.length ? (
          <ul className="mt-4 space-y-3 text-[16px] leading-snug">
            {posts.map((p) => (
              <li key={p.slug}>
                <a href={href(p.url)} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{p.title}</a>
              </li>
            ))}
            <li>
              <a href={href('/blog')} className="text-[#C2410C] underline underline-offset-4">{t('exam.allArticles')}</a>
            </li>
          </ul>
        ) : (
          <p className={`mt-4 text-[16px] ${muted}`}>
            {t('exam.noArticles')} <a href={href('/blog')} className="text-[#C2410C] underline underline-offset-4">{t('exam.browseBlog')}</a>.
          </p>
        )}
      </div>
      <div>
        <h2 className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{t('section.relatedExams')}</h2>
        <ul className="mt-4 space-y-3 text-[16px] leading-snug">
          {related.filter((r) => isPagePublished(locale, `/exams/${r.slug}`)).map((r) => {
            const label = localizedUnit(locale, `exam:${r.slug}`)?.label || r.label;
            return (
              <li key={r.slug}>
                <a href={href(`/exams/${r.slug}`)} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{t('exam.guideLink', { label })}</a>
              </li>
            );
          })}
          <li>
            <a href={href('/exams')} className="text-[#C2410C] underline underline-offset-4">{t('exam.allGuides')}</a>
          </li>
        </ul>
      </div>
    </section>
  );
}

function StudyPlans({ guide }) {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const plans = plansForGuide(guide);
  if (!plans.length) return null;
  return (
    <section aria-labelledby="study-plans-title" className="mt-14">
      <SectionTitle id="study-plans-title">{t('section.studyPlans')}</SectionTitle>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {plans.map((p) => {
          const unit = localizedUnit(locale, `plan:${p.guide}/${p.slug}`) || p;
          const to = planPath(p);
          return (
            <li key={p.slug} className="rounded-2xl border border-[#E7E1D7] bg-white/70 p-6">
              <h3 className={`font-display ${ink} text-[22px] tracking-[-0.02em] font-medium`}>
                <a href={href(to)} className="hover:text-[#C2410C]">{unit.label}</a>
              </h3>
              <p className={`mt-2 text-[16px] leading-[1.6] ${muted}`}>{unit.description}</p>
              <p className="mt-4 text-[15px]">
                <a href={href(to)} className="inline-flex items-center gap-1.5 font-semibold text-[#C2410C] underline underline-offset-4">
                  {t('exam.openPlan', { duration: unit.duration })} <ArrowRight className={arrow} aria-hidden="true" />
                </a>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function planBreadcrumbs(plan, names = {}) {
  const guide = EXAM_PAGES.find((g) => g.slug === plan.guide);
  return [
    { name: names.home || 'Home', path: '/' },
    { name: names.exams || 'Exams', path: '/exams' },
    { name: names.guide || (guide ? guide.label : plan.guide), path: `/exams/${plan.guide}` },
    { name: plan.breadcrumb, path: planPath(plan) }
  ];
}

function relatedLinks(plan, locale, guideLink) {
  return (plan.related || [])
    .map((r) => {
      if (r.type === 'plan') {
        const p = planPage(r.guide, r.slug);
        if (!p) return null;
        const unit = localizedUnit(locale, `plan:${p.guide}/${p.slug}`) || p;
        return { href: planPath(p), label: unit.label };
      }
      const g = EXAM_PAGES.find((x) => x.slug === r.guide);
      if (!g || !isPagePublished(locale, `/exams/${g.slug}`)) return null;
      const label = localizedUnit(locale, `exam:${g.slug}`)?.label || g.label;
      return { href: `/exams/${g.slug}`, label: guideLink(label) };
    })
    .filter(Boolean);
}

function LinkList({ links }) {
  if (!links?.length) return null;
  return (
    <span className="mt-1 block text-[15px]">
      {links.map((l, i) => (
        <React.Fragment key={l.url}>
          {i > 0 ? <span className="text-[#6B635A]"> · </span> : null}
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4">{l.label}</a>
        </React.Fragment>
      ))}
    </span>
  );
}

export function PlanPage({ guide, slug, posts = [] }) {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const plan = useUnit(`plan:${guide}/${slug}`);
  if (!plan) return null;
  const guidePage = localizedUnit(locale, `exam:${plan.guide}`);
  const blogPosts = relatedPosts(posts, plan.tags);
  const checked = formatDate(plan.lastChecked, locale);
  const related = relatedLinks(plan, locale, (label) => t('exam.guideLink', { label }));
  const guideLabel = guidePage?.label || EXAM_PAGES.find((g) => g.slug === plan.guide)?.label || plan.guide;
  return (
    <Shell>
      <article className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <Breadcrumbs items={planBreadcrumbs(plan, { home: t('crumb.home'), exams: t('crumb.exams'), guide: guideLabel })} />
        <header className="mt-6 max-w-3xl">
          <p className={eyebrow}>{t('exam.studyPlan', { duration: plan.duration, level: plan.level })}</p>
          <h1 className={`mt-4 font-display ${ink} text-[38px] sm:text-5xl lg:text-6xl tracking-[-0.03em] font-medium leading-[1.05]`}>{plan.h1}</h1>
          <p className={`mt-6 ${lead}`}>{plan.subhead}</p>
          {checked ? <p className="mt-4 text-[14px] text-[#6B635A]">{t('exam.lastChecked')} <time dateTime={plan.lastChecked}>{checked}</time></p> : null}
        </header>

        <section aria-labelledby="who-title" className="mt-12 max-w-3xl">
          <SectionTitle id="who-title">{t('exam.who')}</SectionTitle>
          <ul className={`mt-4 list-disc pl-5 space-y-2 text-[17px] leading-[1.7] ${muted}`}>
            {plan.whoFor.map((t) => <li key={t.slice(0, 40)}>{t}</li>)}
          </ul>
          {plan.toolNote ? (
            <p className={`mt-4 text-[16px] leading-[1.7] ${muted}`}>
              {plan.toolNote.lead} <a href={href(plan.toolNote.href)} className="text-[#C2410C] underline underline-offset-4">{plan.toolNote.anchor}</a>. {plan.toolNote.tail}
            </p>
          ) : null}
          <PlanPostNotes plan={plan} posts={posts} />
        </section>

        <section aria-labelledby="facts-title" className="mt-14 max-w-4xl">
          <SectionTitle id="facts-title">{t('exam.facts')}</SectionTitle>
          <dl className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
            {plan.facts.map(([k, v]) => (
              <div key={k} className="py-4 grid sm:grid-cols-[14rem_1fr] gap-1 sm:gap-6">
                <dt className={`${ink} font-semibold text-[16px]`}>{k}</dt>
                <dd className={`text-[16px] leading-[1.6] ${muted}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[14px] text-[#6B635A]">{plan.factsNote} {(() => {
            const linkText = t('exam.guideLink', { label: guideLabel });
            const more = t('exam.factsMore', { label: guideLabel });
            const at = more.lastIndexOf(linkText);
            const before = at >= 0 ? more.slice(0, at) : more;
            const after = at >= 0 ? more.slice(at + linkText.length) : '';
            return <>{before}<a href={href(`/exams/${plan.guide}`)} className="text-[#C2410C] underline underline-offset-4">{linkText}</a>{after}</>;
          })()}</p>
        </section>

        <section aria-labelledby="schedule-title" className="mt-14 max-w-4xl">
          <SectionTitle id="schedule-title">{t('exam.plan')}</SectionTitle>
          <ol className="mt-6 space-y-10">
            {plan.phases.map((ph, i) => (
              <li key={ph.title}>
                <h3 id={`phase-${i + 1}`} className={`font-display ${ink} text-[22px] sm:text-[24px] tracking-[-0.02em] font-medium`}>{ph.title}</h3>
                <p className={`mt-1 text-[16px] ${muted}`}>{ph.focus}</p>
                <ul className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
                  {ph.tasks.map((t) => (
                    <li key={t.when} className="py-4 grid sm:grid-cols-[9rem_1fr] gap-1 sm:gap-6">
                      <span className={`${ink} font-semibold text-[16px]`}>{t.when}</span>
                      <span className={`text-[16px] leading-[1.65] ${muted}`}>
                        {t.text}
                        <LinkList links={t.links} />
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className={`mt-8 rounded-2xl border border-[#E7C9B4] bg-[#FBF1E9] px-5 py-4 text-[16px] leading-[1.6] text-[#3B352F]`}>{plan.caution}</p>
        </section>

        <section aria-labelledby="materials-title" className="mt-14 max-w-3xl">
          <SectionTitle id="materials-title">{t('exam.materials')}</SectionTitle>
          <p className={`mt-3 text-[16px] ${muted}`}>{t('exam.materialsLead')}</p>
          <ul className="mt-4 space-y-3 text-[16px] leading-snug">
            {plan.materials.map((m) => (
              <li key={m.url}>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{m.label}</a>
              </li>
            ))}
          </ul>
        </section>

        <Faq faq={plan.faq} />

        <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
          <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{t('section.sources')}</h2>
          <ol className="mt-4 space-y-2 text-[16px] leading-snug">
            {plan.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                  {s.label} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[14px] text-[#6B635A]">
            {checked ? `${t('exam.lastCheckedShort', { date: checked })} ` : ''}{t('exam.planDisclaimer')}
          </p>
        </section>

        <section aria-labelledby="related-title" className="mt-14 grid gap-10 md:grid-cols-2">
          <div>
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{t('section.fromBlog')}</h2>
            {blogPosts.length ? (
              <ul className="mt-4 space-y-3 text-[16px] leading-snug">
                {blogPosts.map((p) => (
                  <li key={p.slug}>
                    <a href={href(p.url)} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{p.title}</a>
                  </li>
                ))}
                <li>
                  <a href={href('/blog')} className="text-[#C2410C] underline underline-offset-4">{t('exam.allArticles')}</a>
                </li>
              </ul>
            ) : (
              <p className={`mt-4 text-[16px] ${muted}`}>
                {t('exam.noArticles')} <a href={href('/blog')} className="text-[#C2410C] underline underline-offset-4">{t('exam.browseBlog')}</a>.
              </p>
            )}
          </div>
          <div>
            <h2 className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{t('section.relatedPlans')}</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              <li>
                <a href={href(`/exams/${plan.guide}`)} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{t('exam.guideLink', { label: guideLabel })}</a>
              </li>
              {TOOL_GUIDES.includes(plan.guide) ? (
                <li>
                  <a href={href(toolPathForGuide(plan.guide))} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{t('exam.clbTool')}</a>
                </li>
              ) : null}
              {related.map((r) => (
                <li key={r.href}>
                  <a href={href(r.href)} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{r.label}</a>
                </li>
              ))}
              <li>
                <a href={href('/exams')} className="text-[#C2410C] underline underline-offset-4">{t('exam.allGuides')}</a>
              </li>
            </ul>
          </div>
        </section>
      </article>
    </Shell>
  );
}

export function ExamPage({ slug, posts = [] }) {
  const t = useT();
  const c = useUnit(`exam:${slug}`);
  if (!c) return null;
  const blogPosts = relatedPosts(posts, c.tags);
  return (
    <Shell>
      <article className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <Breadcrumbs items={examBreadcrumbs(c, { home: t('crumb.home'), exams: t('crumb.exams') })} />
        <header className="mt-6 max-w-3xl">
          <p className={eyebrow}>{t('exam.guide')}</p>
          <h1 className={`mt-4 font-display ${ink} text-[38px] sm:text-5xl lg:text-6xl tracking-[-0.03em] font-medium leading-[1.05]`}>{c.h1}</h1>
          {c.intro.map((p) => (
            <p key={p.slice(0, 32)} className={`mt-6 ${lead}`}>{p}</p>
          ))}
        </header>

        <section aria-label={t('exam.glance')} className="mt-10 max-w-4xl">
          <dl className="divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
            {c.facts.map(([k, v]) => (
              <div key={k} className="py-4 grid sm:grid-cols-[12rem_1fr] gap-1 sm:gap-6">
                <dt className={`${ink} font-semibold text-[16px]`}>{k}</dt>
                <dd className={`text-[16px] leading-[1.6] ${muted}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <StudyPlans guide={slug} />
        <RelatedTool guide={slug} />
        <GuideToolLinks guide={slug} />
        <CompareNote guide={slug} posts={posts} />
        <FormatTable format={c.format} label={c.label} />
        <DeleLevels rows={c.deleLevels} scoring={c.scoring} />
        <Resources groups={c.resources} lastChecked={c.lastChecked} />
        <PlannerCta planner={c.planner} label={c.label} relatedPlanner={c.relatedPlanner} />
        <Faq faq={c.faq} />

        <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
          <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{t('section.sources')}</h2>
          <ol className="mt-4 space-y-2 text-[16px] leading-snug">
            {c.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                  {s.title} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
          <p className={`mt-4 text-[14px] text-[#6B635A]`}>
            {t('exam.disclaimer')}
          </p>
        </section>

        <RelatedReading posts={blogPosts} related={c.related} />
      </article>
    </Shell>
  );
}

export function ExamsIndex({ posts = [] }) {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const index = useUnit('site:exams');
  const pages = EXAM_PAGES.filter((p) => isPagePublished(locale, `/exams/${p.slug}`));
  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <Breadcrumbs items={examBreadcrumbs(null, { home: t('crumb.home'), exams: t('crumb.exams') })} />
        <header className="mt-6 max-w-3xl">
          <p className={eyebrow}>{index.eyebrow}</p>
          <h1 className={`mt-4 font-display ${ink} text-5xl sm:text-6xl tracking-[-0.03em] font-medium leading-[1.02]`}>{index.h1}</h1>
          <p className={`mt-6 ${lead}`}>{index.headDescription}</p>
          <p className={`mt-4 text-[16px] ${muted}`}>
            {t('exam.indexMoreBefore')} <a href={href('/faq')} className="text-[#C2410C] underline underline-offset-4">{t('exam.indexFaq')}</a> {t('exam.indexMoreMid')}{' '}
            <a href={href('/blog')} className="text-[#C2410C] underline underline-offset-4">{t('exam.indexBlog')}</a>.
          </p>
        </header>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {pages.map((p) => {
            const unit = localizedUnit(locale, `exam:${p.slug}`) || p;
            const count = relatedPosts(posts, p.tags).length;
            return (
              <li key={p.slug} className="rounded-2xl border border-[#E7E1D7] bg-white/70 p-6">
                <h2 className={`font-display ${ink} text-[26px] tracking-[-0.02em] font-medium`}>
                  <a href={href(`/exams/${p.slug}`)} className="hover:text-[#C2410C]">{unit.label}</a>
                </h2>
                <p className={`mt-2 text-[16px] leading-[1.6] ${muted}`}>{unit.description}</p>
                <p className="mt-4 text-[15px]">
                  <a href={href(`/exams/${p.slug}`)} className="inline-flex items-center gap-1.5 font-semibold text-[#C2410C] underline underline-offset-4">
                    {t('exam.guideLink', { label: unit.label })} <ArrowRight className={arrow} aria-hidden="true" />
                  </a>
                  {count ? <span className="text-[#6B635A]"> · {t(count === 1 ? 'exam.blogOne' : 'exam.blogMany', { count })}</span> : null}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
}
