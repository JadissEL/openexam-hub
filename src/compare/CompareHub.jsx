import React from 'react';
import { ArrowRight, ArrowUpRight, Download } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import { SkillTable, SectionTitle, dateLabel, linkCls } from './ComparePage.jsx';
import { TABLES, SKILLS, EE_LANGUAGE_URL, EE_LANGUAGE_MODIFIED, tableVerified } from './compareData.js';
import { COMPARE_PAGES, comparePath, compareBreadcrumbs } from './comparePages.js';
import { useHref, useLocale, useT, useUnit } from '../i18n/LocaleContext.jsx';
import { localizedUnit } from '../i18n/publish.js';

const arrow = 'w-4 h-4 rtl:-scale-x-100';

function fill(template, vars) {
  return String(template ?? '').replace(/\{([a-zA-Z0-9]+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

function Faq({ faq, title }) {
  return (
    <section aria-labelledby="exam-faq-title" className="mt-14">
      <SectionTitle id="exam-faq-title">{title}</SectionTitle>
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

/** /compare/clb-equivalency-table */
export function ClbTablePage() {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const page = useUnit('compare:clb-equivalency-table');
  const shared = useUnit('compareData:shared');
  const verified = [...new Set(page.tests.map(tableVerified))].sort();
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={compareBreadcrumbs(page).map((item, i, all) => (
            i === 0 ? { ...item, name: t('crumb.home') } : i === 1 && i < all.length - 1 ? { ...item, name: t('footer.compare') } : item
          ))} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>{page.eyebrow}</p>
            <h1 className={`mt-4 font-display ${ink} text-[34px] sm:text-5xl tracking-[-0.03em] font-medium leading-[1.08]`}>{page.h1}</h1>
            {page.intro.map((p) => (
              <p key={p.slice(0, 32)} className={`mt-6 ${lead}`}>{p}</p>
            ))}
            <p className={`mt-4 text-[14px] ${muted}`}>
              {page.checkedBefore}<time dateTime={EE_LANGUAGE_MODIFIED}>{dateLabel(EE_LANGUAGE_MODIFIED, locale)}</time>{page.checkedMiddle}{' '}
              {verified.map((d, i) => (
                <React.Fragment key={d}>
                  {i > 0 ? page.checkedAnd : ''}
                  <time dateTime={d}>{dateLabel(d, locale)}</time>
                </React.Fragment>
              ))}
              .
            </p>
            <a href={href(page.csvPath)} download className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[#1A1714] hover:bg-black text-white font-semibold">
              <Download className="w-4 h-4" aria-hidden="true" /> {page.download}
            </a>
          </header>

          <section aria-labelledby="clb-title" className="mt-12">
            <SectionTitle id="clb-title">{page.sectionTitle}</SectionTitle>
            <ul className={`mt-3 text-[15px] leading-[1.7] ${muted} max-w-3xl list-disc pl-5`}>
              {page.tests.map((id) => {
                const kind = TABLES[id].listed ? shared.listedKind : shared.rangeKind;
                const rest = fill(page.rowLine, { label: '', scheme: TABLES[id].scheme, kind, date: dateLabel(tableVerified(id), locale) });
                return (
                  <li key={id}>
                    <span className={`font-semibold ${ink}`}>{TABLES[id].label}</span>{rest}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-10">
              {SKILLS.map((s) => (
                <SkillTable key={s} tests={page.tests} skill={s} levelHeader={page.levelHeader} />
              ))}
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href={href('/tools/clb-converter')} className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold">
                {page.convert} <ArrowRight className={arrow} aria-hidden="true" />
              </a>
            </div>
          </section>

          <Faq faq={page.faq} title={page.faqTitle} />

          <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
            <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{page.sourcesTitle}</h2>
            <ol className="mt-4 space-y-2 text-[16px] leading-snug">
              <li>
                <a href={EE_LANGUAGE_URL} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                  {page.sourceLabel} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
            </ol>
            <p className="mt-4 text-[14px] leading-relaxed text-[#6B635A]">{page.disclaimer}</p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{page.relatedTitle}</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              {COMPARE_PAGES.map((p) => {
                const unit = localizedUnit(locale, `compare:${p.slug}`) || p;
                return (
                  <li key={p.slug}><a href={href(comparePath(p))} className={linkCls}>{unit.h1}</a></li>
                );
              })}
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
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const hub = useUnit('compare:hub');
  const table = useUnit('compare:clb-equivalency-table');
  const cards = [
    { href: table.path, title: table.label, text: table.description },
    ...COMPARE_PAGES.map((p) => {
      const unit = localizedUnit(locale, `compare:${p.slug}`) || p;
      return { href: comparePath(p), title: unit.label, text: unit.description };
    })
  ];
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-5xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={[{ name: t('crumb.home'), path: '/' }, { name: hub.label, path: hub.path }]} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>{hub.eyebrow}</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl tracking-[-0.03em] font-medium leading-[1.05]`}>{hub.h1}</h1>
            <p className={`mt-6 ${lead}`}>{hub.lead}</p>
          </header>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.href} className="rounded-2xl border border-[#E7E1D7] bg-white/70 p-6">
                <h2 className={`font-display ${ink} text-[22px] tracking-[-0.01em] font-medium`}>
                  <a href={href(c.href)} className={linkCls}>{c.title}</a>
                </h2>
                <p className={`mt-3 text-[15px] leading-[1.65] ${muted}`}>{c.text}</p>
              </li>
            ))}
          </ul>
          <section aria-labelledby="tools-title" className="mt-14 max-w-3xl">
            <h2 id="tools-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{hub.toolTitle}</h2>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted}`}>
              {hub.toolBefore}<a href={href('/tools/clb-converter')} className={linkCls}>{hub.toolLink}</a>{hub.toolAfter}
            </p>
            <p className="mt-6 text-[14px] leading-relaxed text-[#6B635A]">{hub.disclaimer}</p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
