import React from 'react';
import { ArrowRight, ArrowUpRight, Download } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import { SkillTable, SectionTitle, dateLabel, linkCls } from './ComparePage.jsx';
import { TABLES, SKILLS, EE_LANGUAGE_URL, EE_LANGUAGE_MODIFIED, tableVerified, cellKind } from './compareData.js';
import { COMPARE_PAGES, comparePath, compareBreadcrumbs, CLB_TABLE_PAGE, COMPARE_HUB } from './comparePages.js';

function Faq({ faq }) {
  return (
    <section aria-labelledby="exam-faq-title" className="mt-14">
      <SectionTitle id="exam-faq-title">Questions people ask</SectionTitle>
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
    </section>
  );
}

const DISCLAIMER =
  'OpenExam Hub is independent and not affiliated with IRCC or any test owner named on this page. This page is for information only and is not immigration advice, and it gives no score guarantees. IRCC and the test owners can change their tables at any time, so confirm on canada.ca before you book or apply.';

/** /compare/clb-equivalency-table */
export function ClbTablePage() {
  const page = CLB_TABLE_PAGE;
  const verified = [...new Set(page.tests.map(tableVerified))].sort();
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={compareBreadcrumbs(page)} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>Equivalency table · IRCC’s official tables</p>
            <h1 className={`mt-4 font-display ${ink} text-[34px] sm:text-5xl tracking-[-0.03em] font-medium leading-[1.08]`}>{page.h1}</h1>
            {page.intro.map((p) => (
              <p key={p.slice(0, 32)} className={`mt-6 ${lead}`}>{p}</p>
            ))}
            <p className={`mt-4 text-[14px] ${muted}`}>
              Copied from IRCC’s Express Entry language page (last modified <time dateTime={EE_LANGUAGE_MODIFIED}>{dateLabel(EE_LANGUAGE_MODIFIED)}</time>). Tables last checked on canada.ca on{' '}
              {verified.map((d, i) => (
                <React.Fragment key={d}>
                  {i > 0 ? ' and ' : ''}
                  <time dateTime={d}>{dateLabel(d)}</time>
                </React.Fragment>
              ))}
              .
            </p>
            <a href={page.csvPath} download className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[#1A1714] hover:bg-black text-white font-semibold">
              <Download className="w-4 h-4" aria-hidden="true" /> Download the table as CSV
            </a>
          </header>

          <section aria-labelledby="clb-title" className="mt-12">
            <SectionTitle id="clb-title">CLB / NCLC level by skill, all five tests</SectionTitle>
            <ul className={`mt-3 text-[15px] leading-[1.7] ${muted} max-w-3xl list-disc pl-5`}>
              {page.tests.map((id) => (
                <li key={id}>
                  <span className={`font-semibold ${ink}`}>{TABLES[id].label}</span> ({TABLES[id].scheme}): {cellKind(id)}, checked {dateLabel(tableVerified(id))}.
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-10">
              {SKILLS.map((s) => (
                <SkillTable key={s} tests={page.tests} skill={s} levelHeader="CLB / NCLC" />
              ))}
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href="/tools/clb-converter" className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold">
                Convert your own scores <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </section>

          <Faq faq={page.faq} />

          <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
            <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Sources and disclaimer</h2>
            <ol className="mt-4 space-y-2 text-[16px] leading-snug">
              <li>
                <a href={EE_LANGUAGE_URL} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                  IRCC: Express Entry, Language test results (all five tables and the list of accepted tests) <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
            </ol>
            <p className="mt-4 text-[14px] leading-relaxed text-[#6B635A]">{DISCLAIMER}</p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Side-by-side comparisons</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              {COMPARE_PAGES.map((p) => (
                <li key={p.slug}><a href={comparePath(p)} className={linkCls}>{p.h1}</a></li>
              ))}
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

/** /compare */
export function CompareHub() {
  const hub = COMPARE_HUB;
  const cards = [
    { href: CLB_TABLE_PAGE.path, title: CLB_TABLE_PAGE.label, text: CLB_TABLE_PAGE.description },
    ...COMPARE_PAGES.map((p) => ({ href: comparePath(p), title: p.label, text: p.description }))
  ];
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-5xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: hub.label, path: hub.path }]} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>Comparisons · Official sources</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl tracking-[-0.03em] font-medium leading-[1.05]`}>{hub.h1}</h1>
            <p className={`mt-6 ${lead}`}>
              IRCC accepts three English tests (IELTS General Training, CELPIP-General and PTE Core) and two French tests (TEF Canada and TCF Canada) for Express Entry. These pages line the tests up by the CLB or NCLC level IRCC gives each score, with test facts from the official test sites. Other pages compare French diplomas and German exams by CEFR level, using what the authorities that read them publish. None of them converts one test’s score into another’s.
            </p>
          </header>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.href} className="rounded-2xl border border-[#E7E1D7] bg-white/70 p-6">
                <h2 className={`font-display ${ink} text-[22px] tracking-[-0.01em] font-medium`}>
                  <a href={c.href} className={linkCls}>{c.title}</a>
                </h2>
                <p className={`mt-3 text-[15px] leading-[1.65] ${muted}`}>{c.text}</p>
              </li>
            ))}
          </ul>
          <section aria-labelledby="tools-title" className="mt-14 max-w-3xl">
            <h2 id="tools-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Free tool</h2>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted}`}>
              Have your scores already? The <a href="/tools/clb-converter" className={linkCls}>CLB / NCLC score converter</a> gives your level per skill and your CRS language points from the same IRCC tables.
            </p>
            <p className="mt-6 text-[14px] leading-relaxed text-[#6B635A]">{DISCLAIMER}</p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
