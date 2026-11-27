import React from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import {
  TABLES,
  SKILLS,
  SKILL_LABELS,
  EE_LANGUAGE_URL,
  EE_LANGUAGE_MODIFIED,
  COMPARE_LAST_VERIFIED,
  TEST_FORMATS,
  FORMAT_ROW_LABELS,
  clbRows
} from './compareData.js';
import { comparePageBySlug, compareBreadcrumbs } from './comparePages.js';

function dateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const linkCls = 'text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]';
const regionCls =
  'mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2';

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className={`font-display ${ink} text-[26px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
      {children}
    </h2>
  );
}

function SkillTable({ tests, skill }) {
  const label = SKILL_LABELS[skill].en;
  const names = tests.map((id) => TABLES[id].label);
  return (
    <div>
      <h3 className={`font-display ${ink} text-[20px] tracking-[-0.01em] font-medium`}>{label}</h3>
      <div className={regionCls} tabIndex={0} role="region" aria-label={`${label}: IRCC CLB table, ${names.join(' and ')}`}>
        <table className="w-full text-left text-[15px] leading-snug">
          <caption className="sr-only">{label}: score IRCC gives for each CLB level, {names.join(' and ')}</caption>
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">CLB</th>
              {names.map((n) => (
                <th key={n} scope="col" className="px-4 py-3 font-semibold">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1D7]">
            {clbRows(tests, skill).map((row) => (
              <tr key={row.level}>
                <th scope="row" className={`px-4 py-2.5 font-semibold ${ink}`}>{row.level === 10 ? '10+' : row.level}</th>
                {row.cells.map((c) => (
                  <td key={c.tableId} className="px-4 py-2.5 whitespace-nowrap tabular-nums">{c.text}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormatTable({ tests }) {
  const formats = tests.map((id) => TEST_FORMATS[id]);
  return (
    <div className={regionCls} tabIndex={0} role="region" aria-label={`Test format: ${formats.map((f) => f.name).join(' and ')}`}>
      <table className="w-full text-left text-[15px] leading-snug">
        <caption className="sr-only">Test format, from the official test websites</caption>
        <thead className="bg-[#F1EDE5] text-[#3B352F]">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Detail</span></th>
            {formats.map((f) => (
              <th key={f.name} scope="col" className="px-4 py-3 font-semibold">{f.name}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E7E1D7] align-top">
          {FORMAT_ROW_LABELS.map(([key, label]) => (
            <tr key={key}>
              <th scope="row" className={`px-4 py-3 font-semibold ${ink} whitespace-nowrap`}>{label}</th>
              {formats.map((f) => (
                <td key={f.name} className={`px-4 py-3 min-w-[14rem] ${muted}`}>{f.rows[key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CefrTable({ map }) {
  return (
    <div>
      <h3 className={`font-display ${ink} text-[20px] tracking-[-0.01em] font-medium`}>{map.exam} and the CEFR</h3>
      <div className={regionCls} tabIndex={0} role="region" aria-label={`${map.exam} to CEFR, as published by the test owner`}>
        <table className="w-full text-left text-[15px] leading-snug">
          <caption className="sr-only">{map.exam} to CEFR, as published by the test owner</caption>
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">CEFR</th>
              <th scope="col" className="px-4 py-3 font-semibold">{map.scoreLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1D7]">
            {map.rows.map((r) => (
              <tr key={r.cefr}>
                <th scope="row" className={`px-4 py-2.5 font-semibold ${ink}`}>{r.cefr}</th>
                <td className="px-4 py-2.5 tabular-nums">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-[14px] leading-relaxed ${muted}`}>
        {map.note} Source:{' '}
        {map.sources.map((s, i) => (
          <React.Fragment key={s.url}>
            {i > 0 ? '; ' : ''}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4">{s.label}</a>
          </React.Fragment>
        ))}
        .
      </p>
    </div>
  );
}

export function ComparePage({ slug }) {
  const page = comparePageBySlug(slug);
  if (!page) return null;
  const formats = page.tests.map((id) => TEST_FORMATS[id]);
  const sources = [
    { url: EE_LANGUAGE_URL, label: `IRCC: Express Entry, Language test results (${page.tests.map((id) => TABLES[id].label).join(' and ')} tables, accepted tests)` },
    ...formats.flatMap((f) => [{ url: f.sourceUrl, label: f.sourceLabel }, ...(f.extraSources || [])]),
    ...page.cefr.flatMap((m) => m.sources)
  ].filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i);

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-5xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={compareBreadcrumbs(page)} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>Side-by-side comparison · Official sources</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-[56px] tracking-[-0.03em] font-medium leading-[1.05]`}>{page.h1}</h1>
            {page.intro.map((p) => (
              <p key={p.slice(0, 32)} className={`mt-6 ${lead}`}>{p}</p>
            ))}
            <p className={`mt-4 text-[14px] ${muted}`}>
              Checked against canada.ca and the official test sites on <time dateTime={COMPARE_LAST_VERIFIED}>{dateLabel(COMPARE_LAST_VERIFIED)}</time>.
            </p>
          </header>

          <section aria-labelledby="clb-title" className="mt-12">
            <SectionTitle id="clb-title">CLB level by skill, side by side</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              Each row is one CLB level. Each cell is the score IRCC gives for that level on that test, copied from IRCC’s Express Entry language page (last modified <time dateTime={EE_LANGUAGE_MODIFIED}>{dateLabel(EE_LANGUAGE_MODIFIED)}</time>). For IELTS and CELPIP, IRCC lists the score that earns each level; PTE Core rows are score ranges. CLB 10 is the top level on IRCC’s tables.
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              {SKILLS.map((s) => (
                <SkillTable key={s} tests={page.tests} skill={s} />
              ))}
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {page.tabs.map((t) => (
                <a key={t.href} href={t.href} className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold">
                  {t.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>

          <section aria-labelledby="format-title" className="mt-14">
            <SectionTitle id="format-title">Test format</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              From each test owner’s official page, for the version IRCC accepts for Express Entry. The validity row is IRCC’s rule.
            </p>
            <FormatTable tests={page.tests} />
          </section>

          <section aria-labelledby="cefr-title" className="mt-14">
            <SectionTitle id="cefr-title">CEFR, as each test owner publishes it</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              CEFR is a different scale from CLB, and IRCC uses CLB for Express Entry. These are the test owners’ own CEFR tables, shown separately. They are not used to line the two tests up.
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              {page.cefr.map((m) => (
                <CefrTable key={m.id} map={m} />
              ))}
            </div>
          </section>

          <section aria-labelledby="exam-faq-title" className="mt-14">
            <SectionTitle id="exam-faq-title">Questions people ask</SectionTitle>
            <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7] max-w-3xl">
              {page.faq.map((item) => (
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

          <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
            <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Sources and disclaimer</h2>
            <ol className="mt-4 space-y-2 text-[16px] leading-snug">
              {sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                    {s.label} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[14px] leading-relaxed text-[#6B635A]">
              OpenExam Hub is independent and not affiliated with IRCC or any test owner named on this page. This page is for information only and is not immigration advice, and it gives no score guarantees. IRCC and the test owners can change their tables, formats and rules at any time, so confirm on canada.ca and the official test site before you book or apply.
            </p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Related tools and guides</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              {[...page.tabs, ...page.otherCompare, ...page.guides, ...page.posts].map((l) => (
                <li key={l.href}><a href={l.href} className={linkCls}>{l.label}</a></li>
              ))}
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export default ComparePage;
