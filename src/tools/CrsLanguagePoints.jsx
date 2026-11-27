import React, { useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import {
  CRS_FIRST_LANGUAGE_MAX,
  CRS_FIRST_LANGUAGE_ROWS,
  CRS_LANGUAGE_CORE_MAX,
  CRS_LAST_VERIFIED,
  CRS_SECOND_LANGUAGE_MAX,
  CRS_SECOND_LANGUAGE_ROWS,
  CRS_TOOL_PATH,
  CRS_URL,
  EE_LANGUAGE_URL,
  LEVEL_OPTIONS,
  SKILLS,
  crsLanguagePoints
} from './crsLanguage.js';
import { useHref, useLocale, useT, useUnit } from '../i18n/LocaleContext.jsx';
import { localeMeta } from '../i18n/locales.js';

const linkCls = 'text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]';
const arrow = 'w-4 h-4 rtl:-scale-x-100';

function fill(template, vars) {
  return String(template ?? '').replace(/\{([a-zA-Z0-9]+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

export const crsBreadcrumbs = [
  { name: 'Home', path: '/' },
  { name: 'CRS language points', path: CRS_TOOL_PATH }
];

function dateLabel(date, locale = 'en') {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeMeta(locale || 'en').dateLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className={`font-display ${ink} text-[26px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
      {children}
    </h2>
  );
}

const SCHEME = { en: 'CLB', fr: 'NCLC' };
const EMPTY = { reading: '', listening: '', writing: '', speaking: '' };

function showLevel(lvl, scheme, copy) {
  if (lvl <= 3) return fill(copy.below, { scheme });
  if (lvl >= 10) return fill(copy.top, { scheme });
  return fill(copy.levelN, { scheme, n: lvl });
}

function Toggle({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap w-full sm:w-fit rounded-[28px] bg-[#EDE7DD] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 sm:flex-none h-11 px-3 sm:px-5 rounded-full text-[14px] sm:text-[15px] font-semibold transition-colors ${
            value === o.id ? 'bg-[#1A1714] text-white shadow-sm' : 'text-[#3B352F] hover:bg-white/60'
          }`}
        >
          {o.title}
        </button>
      ))}
    </div>
  );
}

function LevelInputs({ idPrefix, language, levels, onChange, points, copy }) {
  const t = useT();
  const scheme = SCHEME[language];
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {SKILLS.map((s) => (
        <label key={s} htmlFor={`${idPrefix}-${s}`} className="flex flex-col gap-1.5 rounded-2xl border border-[#E7E1D7] bg-white px-4 py-3">
          <span className="text-[14px] font-semibold text-[#3B352F]">
            {t(`skill.${s}`)}
            {points ? <span className="float-right tabular-nums text-[#6B635A] font-normal">{fill(copy.pts, { n: points[s] })}</span> : null}
          </span>
          <select
            id={`${idPrefix}-${s}`}
            value={levels[s]}
            onChange={(e) => onChange({ ...levels, [s]: e.target.value })}
            className="h-11 rounded-xl border border-[#D9D2C8] bg-white px-3 text-[16px] text-[#1A1714] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714]"
          >
            <option value="">{fill(copy.chooseLevel, { scheme })}</option>
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {showLevel(l, scheme, copy)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function Calculator() {
  const copy = useUnit('tool:crs');
  const href = useHref();
  const locale = useLocale();
  const [spouse, setSpouse] = useState('no');
  const [firstLang, setFirstLang] = useState('en');
  const [firstLv, setFirstLv] = useState(EMPTY);
  const [hasSecond, setHasSecond] = useState('yes');
  const [secondLv, setSecondLv] = useState(EMPTY);
  const secondLang = firstLang === 'en' ? 'fr' : 'en';
  const withSpouse = spouse === 'yes';
  const r = useMemo(
    () =>
      crsLanguagePoints({
        first: { language: firstLang, levels: firstLv },
        second: hasSecond === 'yes' ? { language: secondLang, levels: secondLv } : null,
        withSpouse
      }),
    [firstLang, firstLv, hasSecond, secondLang, secondLv, withSpouse]
  );
  const swap = (id) => {
    if (id === firstLang) return;
    setFirstLang(id);
    setFirstLv(secondLv);
    setSecondLv(firstLv);
  };
  const anyFrench = firstLang === 'fr' || hasSecond === 'yes';
  const langName = (id) => copy.langName[id];
  const checked = dateLabel(CRS_LAST_VERIFIED, locale);

  return (
    <section aria-labelledby="calc-title" className="mt-10 rounded-3xl border border-[#E7E1D7] bg-white/80 p-5 sm:p-8 shadow-[0_30px_60px_-40px_rgba(26,23,20,0.35)]">
      <h2 id="calc-title" className="sr-only">{copy.calcTitle}</h2>
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">{copy.stepSituation}</p>
          <div className="mt-3 flex flex-col gap-3">
            <Toggle
              label={copy.spouseLabel}
              options={[
                { id: 'no', title: copy.spouseNo },
                { id: 'yes', title: copy.spouseYes }
              ]}
              value={spouse}
              onChange={setSpouse}
            />
            <Toggle
              label={copy.firstLangLabel}
              options={[
                { id: 'en', title: copy.firstEn },
                { id: 'fr', title: copy.firstFr }
              ]}
              value={firstLang}
              onChange={swap}
            />
          </div>
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">
            {fill(copy.stepFirst, { name: langName(firstLang), scheme: SCHEME[firstLang] })}
          </p>
          <LevelInputs idPrefix="first" language={firstLang} levels={firstLv} onChange={setFirstLv} points={r.first.perSkill} copy={copy} />
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">
            {fill(copy.stepSecond, { name: langName(secondLang), scheme: SCHEME[secondLang] })}
          </p>
          <div className="mt-3">
            <Toggle
              label={fill(copy.haveTest, { name: langName(secondLang) })}
              options={[
                { id: 'yes', title: fill(copy.haveResult, { name: langName(secondLang) }) },
                { id: 'no', title: copy.noSecond }
              ]}
              value={hasSecond}
              onChange={setHasSecond}
            />
          </div>
          {hasSecond === 'yes' ? (
            <LevelInputs idPrefix="second" language={secondLang} levels={secondLv} onChange={setSecondLv} points={r.second?.perSkill} copy={copy} />
          ) : null}
        </div>

        <div aria-live="polite" className="rounded-3xl bg-[#F1EDE5] px-5 sm:px-7 py-6">
          <p className={`text-[16px] font-semibold ${ink}`}>{copy.resultTitle}</p>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[15px]">
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className={muted}>{copy.firstOfficial}</dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums" data-crs-first>
                {r.first.total} <span className="text-[14px] font-normal text-[#6B635A]">/ {r.first.max}</span>
              </dd>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className={muted}>{copy.secondOfficial}</dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums" data-crs-second>
                {r.second ? r.second.total : 0} <span className="text-[14px] font-normal text-[#6B635A]">/ {CRS_SECOND_LANGUAGE_MAX[withSpouse ? 0 : 1]}</span>
              </dd>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className={muted}>{copy.frenchExtra}</dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums" data-crs-bonus>
                {r.frenchBonus} <span className="text-[14px] font-normal text-[#6B635A]">/ 50</span>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[16px]">
            {(() => {
              const extra = r.frenchBonus ? fill(copy.languageExtra, { bonus: r.frenchBonus }) : '';
              const line = fill(copy.languageTotal, { total: '{total}', core: r.core.total, max: r.core.max, extra });
              const [before, after] = line.split('{total}');
              return <>{before}<strong className="tabular-nums">{r.core.total + r.frenchBonus}</strong>{after}</>;
            })()}
          </p>
          {r.second?.capped ? (
            <p className={`mt-2 text-[14px] ${muted}`}>
              {fill(copy.cap, { raw: r.second.raw, max: r.second.max, with: withSpouse ? copy.withSpouse : copy.withoutSpouse })}
            </p>
          ) : null}
          {anyFrench ? <p className={`mt-2 text-[14px] ${muted}`}>{copy.bonus[r.frenchBonusCase] || copy.bonus.none}</p> : null}
          <p className={`mt-2 text-[14px] ${muted}`}>
            {copy.onlyLanguage}
          </p>
        </div>

        <div className="rounded-3xl bg-[#1A1714] px-5 sm:px-7 py-6 text-white">
          <p className="font-display text-[22px] sm:text-[26px] tracking-[-0.02em] font-medium leading-tight">{copy.unknownTitle}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#D9D2C8]">
            {copy.unknownBody}
          </p>
          <a href={href('/tools/clb-converter')} className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold">
            {copy.unknownButton} <ArrowRight className={arrow} aria-hidden="true" />
          </a>
        </div>
      </div>
      <p className="mt-5 text-[13px] leading-snug text-[#6B635A]">
        {fill(copy.fine, { date: checked })}
      </p>
    </section>
  );
}

function PointsTable({ caption, region, rows, labels, maxNote, copy }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2" tabIndex={0} role="region" aria-label={region}>
      <table className="w-full text-left text-[15px] leading-snug">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-[#F1EDE5] text-[#3B352F]">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">{copy.levelPer}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{copy.withCol}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{copy.withoutCol}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className="border-t border-[#EEE8DE]">
              <th scope="row" className="px-4 py-2.5 font-medium">{labels[i]}</th>
              <td className="px-4 py-2.5 tabular-nums">{r.points[0]}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.points[1]}</td>
            </tr>
          ))}
          <tr className="border-t border-[#EEE8DE] bg-[#FAF7F2]">
            <th scope="row" className="px-4 py-2.5 font-semibold">{copy.maximum}</th>
            <td className="px-4 py-2.5 tabular-nums font-semibold">{maxNote[0]}</td>
            <td className="px-4 py-2.5 tabular-nums font-semibold">{maxNote[1]}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function CrsLanguagePoints() {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const copy = useUnit('tool:crs');
  const checked = dateLabel(CRS_LAST_VERIFIED, locale);
  const sourceUrls = { crs: CRS_URL, ee: EE_LANGUAGE_URL };
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={[{ name: t('crumb.home'), path: '/' }, { name: copy.crumb, path: CRS_TOOL_PATH }]} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>{copy.eyebrow}</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-[56px] tracking-[-0.03em] font-medium leading-[1.05]`}>{copy.h1}</h1>
            <p className={`mt-6 ${lead}`}>{fill(copy.lead, { date: checked })}</p>
          </header>

          <Calculator />

          <section aria-labelledby="second-title" className="mt-14 max-w-3xl">
            <SectionTitle id="second-title">{copy.secondTitle}</SectionTitle>
            <p className={`mt-4 ${lead}`}>
              {fill(copy.secondLead, { withSpouse: CRS_SECOND_LANGUAGE_MAX[0], without: CRS_SECOND_LANGUAGE_MAX[1] })}
            </p>
            <PointsTable
              caption={copy.secondCaption}
              region={copy.secondRegion}
              rows={CRS_SECOND_LANGUAGE_ROWS}
              labels={copy.secondLabels}
              maxNote={CRS_SECOND_LANGUAGE_MAX}
              copy={copy}
            />
          </section>

          <section aria-labelledby="first-title" className="mt-14 max-w-3xl">
            <SectionTitle id="first-title">{copy.firstTitle}</SectionTitle>
            <p className={`mt-4 ${lead}`}>
              {fill(copy.firstLead, { firstWith: CRS_FIRST_LANGUAGE_MAX[0], firstWithout: CRS_FIRST_LANGUAGE_MAX[1], coreWith: CRS_LANGUAGE_CORE_MAX[0], coreWithout: CRS_LANGUAGE_CORE_MAX[1] })}
            </p>
            <PointsTable
              caption={copy.firstCaption}
              region={copy.firstRegion}
              rows={CRS_FIRST_LANGUAGE_ROWS}
              labels={copy.firstLabels}
              maxNote={CRS_FIRST_LANGUAGE_MAX}
              copy={copy}
            />
          </section>

          <section aria-labelledby="bonus-title" className="mt-14 max-w-3xl">
            <SectionTitle id="bonus-title">{copy.bonusTitle}</SectionTitle>
            <ul className={`mt-4 space-y-2 list-disc pl-5 text-[16px] leading-relaxed ${muted}`}>
              {copy.bonusItems.map((item) => (
                <li key={item.strong}>{item.before}<strong className={ink}>{item.strong}</strong>{item.after}</li>
              ))}
            </ul>
            <p className={`mt-3 text-[15px] ${muted}`}>
              {copy.bonusNote}
            </p>
          </section>

          <section aria-labelledby="faq-title" className="mt-14 max-w-3xl">
            <SectionTitle id="faq-title">{copy.faqTitle}</SectionTitle>
            <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
              {copy.faq.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className={`cursor-pointer list-none flex items-start justify-between gap-4 text-[17px] font-medium ${ink}`}>
                    {f.q}
                    <span aria-hidden="true" className="text-[#C2410C] group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className={`mt-3 text-[16px] leading-relaxed ${muted}`}>{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section aria-labelledby="sources-title" className="mt-14 max-w-3xl">
            <SectionTitle id="sources-title">{copy.sourcesTitle}</SectionTitle>
            <ul className="mt-4 space-y-2 text-[16px]">
              {copy.sources.map((s) => (
                <li key={s.urlKey}>
                  <a href={sourceUrls[s.urlKey]} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    {s.label}
                    <ArrowUpRight className="inline w-4 h-4 ml-1" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
            <p className={`mt-3 text-[14px] ${muted}`}>{fill(copy.checked, { date: checked })}</p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <SectionTitle id="related-title">{copy.relatedTitle}</SectionTitle>
            <ul className="mt-4 space-y-2 text-[16px]">
              {copy.related.map((item) => (
                <li key={item.href}><a href={href(item.href)} className={linkCls}>{item.label}</a></li>
              ))}
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
