import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, X as XIcon } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import { count } from '../analytics.js';
import {
  CRS_URL,
  EE_LANGUAGE_MODIFIED,
  EE_LANGUAGE_URL,
  ENGLISH_LAST_VERIFIED,
  FRENCH_BONUS,
  LAST_VERIFIED,
  PTE_CORE_SCORING_URL,
  PTE_LAST_VERIFIED,
  SKILLS,
  SKILL_LABELS,
  START_UP_URL,
  TABLES,
  convert,
  formatScore,
  bandText,
  maxScore,
  plannerHref,
  recommendedLevel
} from './clbData.js';
import { TOOL_PATH, DEFAULT_TOOL_MODE, modeFromSearch, searchWithTab } from './clbContent.js';
import { useHref, useLocale, useT, useUnit } from '../i18n/LocaleContext.jsx';
import { localeMeta } from '../i18n/locales.js';

const arrow = 'w-4 h-4 rtl:-scale-x-100';

function fill(template, vars) {
  return String(template ?? '').replace(/\{([a-zA-Z0-9]+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

const MODES = [
  { id: 'TEF_EXPRESS_ENTRY', tab: 'tef', title: 'TEF Canada' },
  { id: 'TCF_CANADA', tab: 'tcf', title: 'TCF Canada' },
  { id: 'IELTS_GT', tab: 'ielts', title: 'IELTS' },
  { id: 'CELPIP_G', tab: 'celpip', title: 'CELPIP' },
  { id: 'PTE_CORE', tab: 'pte', title: 'PTE Core' }
];

function verifiedLabel(date = LAST_VERIFIED, locale = 'en') {
  const [y, m, d] = (date || LAST_VERIFIED).split('-').map(Number);
  const meta = localeMeta(locale || 'en');
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(meta.dateLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function showLevel(level, scheme, copy) {
  if (level == null) return '–';
  if (level < 4) return fill(copy.below, { scheme });
  if (level >= 10) return fill(copy.top, { scheme });
  return fill(copy.levelN, { scheme, n: level });
}

export const toolBreadcrumbs = [
  { name: 'Home', path: '/' },
  { name: 'CLB / NCLC score converter', path: TOOL_PATH }
];

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className={`font-display ${ink} text-[26px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
      {children}
    </h2>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap w-full sm:w-fit sm:self-start rounded-[28px] bg-[#EDE7DD] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 sm:flex-none h-11 px-2.5 sm:px-5 rounded-full text-[14px] sm:text-[15px] font-semibold transition-colors ${
            value === o.id ? 'bg-[#1A1714] text-white shadow-sm' : 'text-[#3B352F] hover:bg-white/60'
          }`}
        >
          {o.title}
        </button>
      ))}
    </div>
  );
}

const cellText = (table, r) => bandText(table, r);

function ReferenceTable({ table }) {
  const t = useT();
  const copy = useUnit('tool:clb');
  const scheme = table.scheme;
  return (
    <div className="mt-5 first:mt-0">
      <h3 className={`font-display ${ink} text-[20px] tracking-[-0.01em] font-medium`}>{table.label}</h3>
      <div
        className="mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2"
        tabIndex={0}
        role="region"
        aria-label={copy.regions[table.id] || `IRCC ${table.short || table.label} table`}
      >
        <table className="w-full text-left text-[15px] leading-snug">
          <caption className="sr-only">{fill(table.listed ? copy.captionListed : copy.captionRange, { label: table.label, scheme })}</caption>
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{scheme}</th>
              {SKILLS.map((s) => (
                <th key={s} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{t(`skill.${s}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1D7]">
            {[10, 9, 8, 7, 6, 5, 4].map((lvl) => (
              <tr key={lvl}>
                <th scope="row" className={`px-4 py-2.5 font-semibold ${ink}`}>{lvl === 10 ? '10' : lvl}</th>
                {SKILLS.map((s) => {
                  const r = table.bands[s].find((b) => b.level === lvl);
                  return (
                    <td key={s} className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {cellText(table, r)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrsTable() {
  const copy = useUnit('tool:clb');
  const points = [
    [0, 0],
    [6, 6],
    [8, 9],
    [16, 17],
    [22, 23],
    [29, 31],
    [32, 34]
  ];
  return (
    <div
      className="mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2"
      tabIndex={0}
      role="region"
      aria-label={copy.crsRegion}
    >
      <table className="w-full text-left text-[15px] leading-snug">
        <caption className="sr-only">{copy.crsCaption}</caption>
        <thead className="bg-[#F1EDE5] text-[#3B352F]">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">{copy.levelPer}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{copy.withSpouseCol}</th>
            <th scope="col" className="px-4 py-3 font-semibold">{copy.withoutCol}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E7E1D7]">
          {points.map(([a, b], i) => (
            <tr key={copy.crsLevels[i]}>
              <th scope="row" className={`px-4 py-2.5 font-semibold ${ink} whitespace-nowrap`}>{copy.crsLevels[i]}</th>
              <td className="px-4 py-2.5 tabular-nums">{a}</td>
              <td className="px-4 py-2.5 tabular-nums">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Meets({ ok, label, detail, yes, notYet }) {
  return (
    <li className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${ok ? 'border-[#BFD9C4] bg-[#EEF7EF]' : 'border-[#E7C9B4] bg-[#FBF1E9]'}`}>
      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-[#2F7D3B] text-white' : 'bg-[#C2410C] text-white'}`} aria-hidden="true">
        {ok ? <Check className="w-4 h-4" /> : <XIcon className="w-4 h-4" />}
      </span>
      <span className="text-[16px] leading-snug">
        <strong className={ink}>{label}: {ok ? yes : notYet}</strong>
        {detail ? <span className={`block text-[14px] ${muted}`}>{detail}</span> : null}
      </span>
    </li>
  );
}

function syncTabInUrl(mode) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const next = window.location.pathname + searchWithTab(window.location.search, mode) + window.location.hash;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(null, '', next);
}

function Converter() {
  const copy = useUnit('tool:clb');
  const href = useHref();
  const locale = useLocale();
  const t = useT();
  // Always start on TEF so the prerendered HTML and the first client render match. A ?tab= value is
  // applied after mount (and invalid values are ignored, leaving TEF).
  const [mode, setMode] = useState(DEFAULT_TOOL_MODE);
  const [scores, setScores] = useState({ reading: '', listening: '', writing: '', speaking: '' });
  const [spouse, setSpouse] = useState(false);
  const [touched, setTouched] = useState({});
  const counted = useRef(false);

  useEffect(() => {
    const next = modeFromSearch(window.location.search);
    setMode(next);
    syncTabInUrl(next);
  }, []);

  // Scores from one scale mean nothing on another, so switching test or scale starts a fresh form.
  const chooseMode = (id) => {
    if (id === mode) return;
    setMode(id);
    setScores({ reading: '', listening: '', writing: '', speaking: '' });
    setTouched({});
    syncTabInUrl(id);
  };

  const tableId = mode;
  const table = TABLES[tableId];
  const result = useMemo(() => convert(tableId, scores, { withSpouse: spouse }), [tableId, scores, spouse]);
  const anyEntered = SKILLS.some((s) => String(scores[s]).trim() !== '');

  // One cookieless count per page view, the first time a full set of scores converts.
  useEffect(() => {
    if (result.complete && !counted.current) {
      counted.current = true;
      count('clb_tool_used');
    }
  }, [result.complete]);

  const level = result.lowest;
  const cta = plannerHref(tableId, level);
  const ctaLevel = recommendedLevel(level);
  const examName = table.examName || (table.exam === 'TCF_CANADA' ? 'TCF Canada' : 'TEF Canada');
  const scheme = table.scheme;
  const french = table.language === 'fr';
  const tableVerified = french ? LAST_VERIFIED : tableId === 'PTE_CORE' ? PTE_LAST_VERIFIED : ENGLISH_LAST_VERIFIED;
  const activeTab = mode === 'TEF_NEW_699' ? 'TEF_EXPRESS_ENTRY' : mode;

  return (
    <section aria-labelledby="tool-title" className="mt-10 rounded-3xl border border-[#E7E1D7] bg-white/80 p-5 sm:p-8 shadow-[0_30px_60px_-40px_rgba(26,23,20,0.35)]">
      <h2 id="tool-title" className="sr-only">{copy.converterTitle}</h2>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">{copy.stepTest}</p>
        <Segmented
          label={copy.testLabel}
          options={MODES}
          value={activeTab}
          onChange={(id) => {
            if (id === 'TEF_EXPRESS_ENTRY' && mode === 'TEF_NEW_699') return;
            chooseMode(id);
          }}
        />
        {table.notice ? (
          <p className="mt-1 rounded-2xl border border-[#E7C9B4] bg-[#FBF1E9] px-4 py-3 text-[15px] leading-snug text-[#3B352F]">
            {copy.notices[table.id] || table.notice}
            {table.id === 'CELPIP_G' ? (
              <>
                {copy.celpipBefore}
                <a href={href('/exams/celpip')} className="text-[#C2410C] underline underline-offset-4">{copy.celpipGuide}</a>
                {copy.celpipAfter}
              </>
            ) : null}
            {table.id === 'PTE_CORE' ? (
              <>
                {copy.pteBefore}
                <a href={href('/compare/ielts-vs-pte')} className="text-[#C2410C] underline underline-offset-4">{copy.pteLink}</a>
                {copy.pteAfter}
              </>
            ) : null}
          </p>
        ) : null}
        {activeTab === 'TEF_EXPRESS_ENTRY' ? (
          <div className="mt-1">
            <label className="flex items-start gap-3 text-[15px] leading-snug text-[#3B352F]">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-[#C2410C]"
                checked={mode === 'TEF_NEW_699'}
                onChange={(e) => chooseMode(e.target.checked ? 'TEF_NEW_699' : 'TEF_EXPRESS_ENTRY')}
              />
              <span>
                {copy.tefScale}
                <span className={`block text-[14px] ${muted}`}>
                  {copy.tefScaleHelp}
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </div>

      <div className="mt-7">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">{copy.stepScores}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {SKILLS.map((s) => {
            const r = result.perSkill[s];
            const showError = !r.ok && !r.empty && (touched[s] || String(scores[s]).length >= 3);
            const id = `clb-${s}`;
            return (
              <div key={s}>
                <label htmlFor={id} className={`block text-[15px] font-semibold ${ink}`}>
                  {t(`skill.${s}`)}
                  <span lang="fr" className="block text-[12px] font-normal text-[#6B635A] leading-tight">{SKILL_LABELS[s].fr}</span>
                </label>
                <input
                  id={id}
                  name={s}
                  type="text"
                  inputMode={table.step === 0.5 ? 'decimal' : 'numeric'}
                  autoComplete="off"
                  pattern={table.step === 0.5 ? '[0-9]*[.,]?[0-9]?' : '[0-9]*'}
                  maxLength={4}
                  value={scores[s]}
                  placeholder={fill(copy.maxPlaceholder, { score: formatScore(tableId, maxScore(tableId, s)) })}
                  aria-invalid={showError ? 'true' : undefined}
                  aria-describedby={`${id}-out`}
                  onChange={(e) => setScores((prev) => ({ ...prev, [s]: e.target.value.replace(/\s/g, '') }))}
                  onBlur={() => setTouched((t) => ({ ...t, [s]: true }))}
                  className={`mt-2 w-full h-12 rounded-xl border bg-white px-3 text-[18px] tabular-nums text-[#1A1714] placeholder:text-[#9A9288] placeholder:text-[15px] focus:outline-none focus:ring-2 focus:ring-[#C2410C]/40 ${showError ? 'border-[#B91C1C]' : 'border-[#D9D2C8]'}`}
                />
                <p id={`${id}-out`} className="mt-2 min-h-[1.5rem] text-[14px] leading-snug">
                  {r.ok ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold ${r.level >= 9 ? 'bg-[#EEF7EF] text-[#1F6B2C]' : r.level >= 7 ? 'bg-[#FBF1E9] text-[#9A3412]' : 'bg-[#F3EEE6] text-[#5C554C]'}`}>
                      {showLevel(r.level, scheme, copy)}
                    </span>
                  ) : showError ? (
                    <span className="text-[#B91C1C]">{r.error}</span>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 border-t border-[#E7E1D7] pt-6" aria-live="polite">
        {!result.complete ? (
          <p className={`text-[16px] ${muted}`}>
            {anyEntered ? fill(copy.addRemaining, { scheme }) : copy.emptyResult}
          </p>
        ) : (
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">{copy.yourResult}</p>
            <p className={`mt-2 font-display ${ink} text-[34px] sm:text-[44px] leading-[1.05] tracking-[-0.02em] font-medium`}>
              {fill(copy.lowest, { level: showLevel(level, scheme, copy) })}
            </p>
            <p className={`mt-2 text-[16px] ${muted}`}>
              {copy.lowestNote}
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              <Meets
                ok={result.meets7}
                yes={copy.yes}
                notYet={copy.notYet}
                label={fill(copy.meets7, { scheme })}
                detail={result.meets7 ? fill(copy.meetsYes, { scheme, level: 7 }) : fill(copy.meetsNo, { level: 7, skills: result.below7.map((s) => t(`skill.${s}`)).join(', ') })}
              />
              <Meets
                ok={result.meets9}
                yes={copy.yes}
                notYet={copy.notYet}
                label={fill(copy.meets9, { scheme })}
                detail={result.meets9 ? fill(copy.meetsYes, { scheme, level: 9 }) : fill(copy.meetsNo, { level: 9, skills: result.below9.map((s) => t(`skill.${s}`)).join(', ') })}
              />
            </ul>

            {result.crs ? (
              <div className="mt-6 rounded-2xl border border-[#E7E1D7] bg-[#FBF9F5] p-4 sm:p-5">
                <p className={`text-[16px] font-semibold ${ink}`}>{copy.crsHeading}</p>
                <div className="mt-3">
                  <Segmented
                    label={copy.familyLabel}
                    options={[{ id: 'single', title: copy.noSpouse }, { id: 'spouse', title: copy.withSpouse }]}
                    value={spouse ? 'spouse' : 'single'}
                    onChange={(id) => setSpouse(id === 'spouse')}
                  />
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-2 text-[15px] sm:grid-cols-4">
                  {SKILLS.map((s) => (
                    <li key={s} className="rounded-xl bg-white px-3 py-2 border border-[#EDE7DD]">
                      <span className="block text-[13px] text-[#6B635A]">{t(`skill.${s}`)}</span>
                      <span className="text-[18px] font-semibold tabular-nums">{result.perSkill[s].points}</span>
                    </li>
                  ))}
                </ul>
                <p className={`mt-4 text-[17px] ${ink}`}>
                  {copy.totalPoints.split('{total}')[0]}<strong className="tabular-nums">{result.crs.total}</strong>{fill(copy.totalPoints.split('{total}')[1], { max: result.crs.max })}
                </p>
                {french ? (
                  <p className={`mt-2 text-[14px] leading-snug ${muted}`}>
                    {fill(copy.frenchCrs, { low: FRENCH_BONUS.lowEnglish, strong: FRENCH_BONUS.strongEnglish, eligible: result.frenchBonusEligible ? copy.frenchEligible : '' })}
                  </p>
                ) : (
                  <p className={`mt-2 text-[14px] leading-snug ${muted}`}>
                    {copy.englishCrs}
                  </p>
                )}
              </div>
            ) : (
              <p className={`mt-6 rounded-2xl border border-[#E7C9B4] bg-[#FBF1E9] px-4 py-3 text-[15px] leading-snug text-[#3B352F]`}>
                {copy.noCrs}
              </p>
            )}
          </div>
        )}

        {cta ? (
        <div className="mt-6 rounded-3xl bg-[#1A1714] px-5 sm:px-7 py-6 text-white">
            <p className="font-display text-[22px] sm:text-[26px] tracking-[-0.02em] font-medium leading-tight">
              {result.complete && result.meets9
                ? fill(copy.ctaMeet9, { scheme })
                : result.complete && result.meets7
                  ? fill(copy.ctaMeet7, { scheme })
                  : copy.ctaGap}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#D9D2C8]">
              {result.complete
                ? fill(copy.ctaComplete, { exam: examName, level: ctaLevel })
                : fill(copy.ctaIncomplete, { exam: examName, level: ctaLevel })}
            </p>
            <a
              href={href(cta)}
              data-clb-cta
              className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold"
            >
              {copy.ctaButton} <ArrowRight className={arrow} aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl bg-[#1A1714] px-5 sm:px-7 py-6 text-white">
            <p className="font-display text-[22px] sm:text-[26px] tracking-[-0.02em] font-medium leading-tight">
              {copy.pteCtaTitle}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#D9D2C8]">
              {copy.pteCtaBody}
            </p>
            <a
              href={href('/compare/ielts-vs-pte')}
              data-clb-cta
              className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold"
            >
              {copy.pteCtaButton} <ArrowRight className={arrow} aria-hidden="true" />
            </a>
          </div>
        )}
      </div>

      <p className="mt-5 text-[13px] leading-snug text-[#6B635A]">
        {fill(copy.fineBefore, { date: verifiedLabel(tableVerified, locale) })}
        <a href={mode === 'TEF_NEW_699' ? START_UP_URL : EE_LANGUAGE_URL} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4">{copy.fineSite}</a>
        {copy.fineAfter}
      </p>
    </section>
  );
}

export default function ClbConverter() {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const copy = useUnit('tool:clb');
  const tef = TABLES.TEF_EXPRESS_ENTRY;
  const tcf = TABLES.TCF_CANADA;
  const tef699 = TABLES.TEF_NEW_699;
  const ielts = TABLES.IELTS_GT;
  const celpip = TABLES.CELPIP_G;
  const pte = TABLES.PTE_CORE;
  const dates = {
    ieltsDate: verifiedLabel(ENGLISH_LAST_VERIFIED, locale),
    pteDate: verifiedLabel(PTE_LAST_VERIFIED, locale),
    tefDate: verifiedLabel(LAST_VERIFIED, locale)
  };
  const sourceUrls = { ee: EE_LANGUAGE_URL, pte: PTE_CORE_SCORING_URL, startup: START_UP_URL, crs: CRS_URL };
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={[{ name: t('crumb.home'), path: '/' }, { name: copy.crumb, path: TOOL_PATH }]} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>{copy.eyebrow}</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-[56px] tracking-[-0.03em] font-medium leading-[1.05]`}>{copy.h1}</h1>
            <p className={`mt-6 ${lead}`}>{fill(copy.lead, dates)}</p>
          </header>

          <Converter />

          <section aria-labelledby="how-title" className="mt-14 max-w-3xl">
            <SectionTitle id="how-title">{copy.whatTitle}</SectionTitle>
            <ul className={`mt-4 list-disc pl-5 space-y-2 text-[17px] leading-[1.7] ${muted}`}>
              {copy.enter.map((item) => (
                <li key={item.strong || item.text || item.before}>
                  {item.strong ? <strong className={ink}>{item.strong}</strong> : null}
                  {item.text || null}
                  {item.before || null}
                  {item.href ? <a href={href(item.href)} className="text-[#C2410C] underline underline-offset-4">{item.anchor}</a> : null}
                  {item.after || null}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="tables-title" className="mt-14">
            <SectionTitle id="tables-title">{copy.tablesTitle}</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              {fill(copy.tablesLead, dates)}
            </p>
            <div className="mt-6 space-y-9">
              <ReferenceTable table={ielts} />
              <ReferenceTable table={celpip} />
              <ReferenceTable table={pte} />
              <ReferenceTable table={tef} />
              <ReferenceTable table={tcf} />
              <ReferenceTable table={tef699} />
            </div>
          </section>

          <section aria-labelledby="crs-title" className="mt-14 max-w-3xl">
            <SectionTitle id="crs-title">{copy.crsSection}</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted}`}>
              {copy.crsLead}
            </p>
            <CrsTable />
            <p className={`mt-3 text-[15px] ${muted}`}>
              {copy.crsBothBefore}
              <a href={href('/tools/crs-language-points')} className="text-[#C2410C] underline underline-offset-4">{copy.crsCalc}</a>
              {copy.crsBothAfter}
            </p>
          </section>

          <section aria-labelledby="exam-faq-title" className="mt-14">
            <SectionTitle id="exam-faq-title">{copy.faqTitle}</SectionTitle>
            <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7] max-w-3xl">
              {copy.faq.map((item) => (
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
              {copy.faqMore} <a href={href('/faq')} className="text-[#C2410C] underline underline-offset-4">{copy.faqLink}</a>.
            </p>
          </section>

          <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
            <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{copy.sourcesTitle}</h2>
            <ol className="mt-4 space-y-2 text-[16px] leading-snug">
              {copy.sources.map((s) => (
                <li key={s.urlKey}>
                  <a href={sourceUrls[s.urlKey]} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                    {s.label} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[14px] leading-relaxed text-[#6B635A]">
              {copy.modifiedBefore}<time dateTime={EE_LANGUAGE_MODIFIED}>{verifiedLabel(EE_LANGUAGE_MODIFIED, locale)}</time>{copy.modifiedAfter}<time dateTime={ENGLISH_LAST_VERIFIED}>{verifiedLabel(ENGLISH_LAST_VERIFIED, locale)}</time>{copy.pteVerified}<time dateTime={PTE_LAST_VERIFIED}>{verifiedLabel(PTE_LAST_VERIFIED, locale)}</time>{copy.tefVerified}<time dateTime={LAST_VERIFIED}>{verifiedLabel(LAST_VERIFIED, locale)}</time>{copy.sourcesTail}
            </p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>{copy.relatedTitle}</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              {copy.related.map((item) => (
                <li key={item.href}>
                  <a href={href(item.href)} className={item.accent ? 'text-[#C2410C] underline underline-offset-4' : 'text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]'}>{item.label}</a>
                  {item.note ? <span className="text-[#6B635A]">{item.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
