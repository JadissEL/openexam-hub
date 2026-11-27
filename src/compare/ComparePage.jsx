import React from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import {
  TABLES,
  SKILLS,
  EE_LANGUAGE_URL,
  EE_LANGUAGE_MODIFIED,
  COMPARE_LAST_VERIFIED,
  clbRows
} from './compareData.js';
import { compareBreadcrumbs } from './comparePages.js';
import { useHref, useLocale, useT, useUnit } from '../i18n/LocaleContext.jsx';
import { localeMeta } from '../i18n/locales.js';

const arrow = 'w-4 h-4 rtl:-scale-x-100';

function fill(template, vars) {
  return String(template ?? '').replace(/\{([a-zA-Z0-9]+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

export function dateLabel(iso, locale = 'en') {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeMeta(locale).dateLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const linkCls = 'text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]';
const regionCls =
  'mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2';

export function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className={`font-display ${ink} text-[26px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
      {children}
    </h2>
  );
}

export function SkillTable({ tests, skill, levelHeader = 'CLB' }) {
  const t = useT();
  const shared = useUnit('compareData:shared');
  const label = t(`skill.${skill}`);
  const names = tests.map((id) => TABLES[id].label);
  const joined = names.join(shared.joinAnd);
  return (
    <div>
      <h3 className={`font-display ${ink} text-[20px] tracking-[-0.01em] font-medium`}>{label}</h3>
      <div className={regionCls} tabIndex={0} role="region" aria-label={fill(shared.skillRegion, { label, level: levelHeader, names: joined })}>
        <table className="w-full text-left text-[15px] leading-snug">
          <caption className="sr-only">{fill(shared.skillCaption, { label, level: levelHeader, names: joined })}</caption>
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{levelHeader}</th>
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

function FormatTable({ tests, rowLabels }) {
  const shared = useUnit('compareData:shared');
  const labels = rowLabels || shared.rowLabels;
  const formats = tests.map((id) => shared.formats[id]).filter(Boolean);
  const joined = formats.map((f) => f.name).join(shared.joinAnd);
  return (
    <div className={regionCls} tabIndex={0} role="region" aria-label={fill(shared.formatRegion, { names: joined })}>
      <table className="w-full text-left text-[15px] leading-snug">
        <caption className="sr-only">{shared.formatCaption}</caption>
        <thead className="bg-[#F1EDE5] text-[#3B352F]">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">{shared.detail}</span></th>
            {formats.map((f) => (
              <th key={f.name} scope="col" className="px-4 py-3 font-semibold">{f.name}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E7E1D7] align-top">
          {labels.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={`px-4 py-3 font-semibold ${ink} whitespace-nowrap`}>{row.label}</th>
              {formats.map((f) => (
                <td key={f.name} className={`px-4 py-3 min-w-[14rem] ${muted}`}>{f.rows[row.id]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CefrTable({ map }) {
  const shared = useUnit('compareData:shared');
  const heading = fill(shared.cefrHeading, { exam: map.exam });
  const region = fill(shared.cefrRegion, { exam: map.exam });
  return (
    <div>
      <h3 className={`font-display ${ink} text-[20px] tracking-[-0.01em] font-medium`}>{heading}</h3>
      <div className={regionCls} tabIndex={0} role="region" aria-label={region}>
        <table className="w-full text-left text-[15px] leading-snug">
          <caption className="sr-only">{region}</caption>
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">{shared.cefrCol}</th>
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
        {map.note} {shared.sourceWord}{' '}
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

function rowLabelsFor(page, shared) {
  if (page.slug === 'delf-vs-tcf') return shared.frenchRows;
  if (page.slug === 'goethe-vs-telc') return shared.germanRows;
  return shared.rowLabels;
}

export function ComparePage({ slug }) {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const page = useUnit(`compare:${slug}`);
  const shared = useUnit('compareData:shared');
  if (!page) return null;
  const tests = page.tests || [];
  const formatIds = page.formats || tests;
  const formats = formatIds.map((id) => shared.formats[id]).filter(Boolean);
  const cefr = page.cefr || [];
  const scheme = page.scheme || 'CLB';
  const sources = [
    ...(tests.length ? [{ url: EE_LANGUAGE_URL, label: fill(shared.irccSource, { tests: tests.map((id) => TABLES[id].label).join(shared.joinAnd) }) }] : []),
    ...formats.flatMap((f) => [{ url: f.sourceUrl, label: f.sourceLabel }, ...(f.extraSources || [])]),
    ...cefr.flatMap((m) => m.sources),
    ...(page.extraSources || [])
  ].filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i);

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-5xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={compareBreadcrumbs(page).map((item, i, all) => (
            i === 0 ? { ...item, name: t('crumb.home') } : i === 1 && i < all.length - 1 ? { ...item, name: t('footer.compare') } : item
          ))} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>{page.eyebrow || shared.eyebrow}</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-[56px] tracking-[-0.03em] font-medium leading-[1.05]`}>{page.h1}</h1>
            {page.intro.map((p) => (
              <p key={p.slice(0, 32)} className={`mt-6 ${lead}`}>{p}</p>
            ))}
            <p className={`mt-4 text-[14px] ${muted}`}>
              {page.checkedNote || shared.checked} <time dateTime={COMPARE_LAST_VERIFIED}>{dateLabel(COMPARE_LAST_VERIFIED, locale)}</time>.
            </p>
          </header>

          {tests.length ? (
          <section aria-labelledby="clb-title" className="mt-12">
            <SectionTitle id="clb-title">{fill(shared.levelTitle, { scheme })}</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              {fill(shared.rowBefore, { scheme })}<time dateTime={EE_LANGUAGE_MODIFIED}>{dateLabel(EE_LANGUAGE_MODIFIED, locale)}</time>{shared.rowAfter}{page.tableNote || shared.tableNote} {fill(shared.topLevel, { scheme })}
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              {SKILLS.map((s) => (
                <SkillTable key={s} tests={tests} skill={s} levelHeader={scheme} />
              ))}
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {page.tabs.map((tab) => (
                <a key={tab.href} href={href(tab.href)} className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold">
                  {tab.label} <ArrowRight className={arrow} aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
          ) : null}

          {page.facts ? (
            <section aria-labelledby="facts-title" className="mt-12">
              <SectionTitle id="facts-title">{page.facts.title}</SectionTitle>
              <ul className={`mt-4 space-y-3 text-[16px] leading-[1.7] ${muted} max-w-3xl list-disc pl-5`}>
                {page.facts.items.map((f) => (
                  <li key={f.slice(0, 40)}>{f}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="format-title" className="mt-14">
            <SectionTitle id="format-title">{shared.testFormat}</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              {page.formatNote || shared.formatNote}
            </p>
            <FormatTable tests={formatIds} rowLabels={rowLabelsFor(page, shared)} />
          </section>

          {cefr.length ? (
          <section aria-labelledby="cefr-title" className="mt-14">
            <SectionTitle id="cefr-title">{shared.cefrTitle}</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              {shared.cefrLead}
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              {cefr.map((m) => (
                <CefrTable key={m.id} map={m} />
              ))}
            </div>
          </section>
          ) : null}

          <section aria-labelledby="exam-faq-title" className="mt-14">
            <SectionTitle id="exam-faq-title">{shared.faq}</SectionTitle>
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
            <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{shared.sources}</h2>
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
              {page.disclaimer || shared.disclaimer}
            </p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{shared.related}</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              {[...(page.tabs || []), ...(page.otherCompare || []), ...(page.guides || []), ...(page.posts || [])].map((l) => (
                <li key={l.href}><a href={href(l.href)} className={linkCls}>{l.label}</a></li>
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
