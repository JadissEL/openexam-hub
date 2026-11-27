import React, { useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import { SKILL_LABELS } from './clbData.js';
import {
  CRS_FIRST_LANGUAGE_MAX,
  CRS_FIRST_LANGUAGE_ROWS,
  CRS_LANGUAGE_CORE_MAX,
  CRS_LAST_VERIFIED,
  CRS_SECOND_LANGUAGE_MAX,
  CRS_SECOND_LANGUAGE_ROWS,
  CRS_TOOL_FAQ,
  CRS_TOOL_H1,
  CRS_TOOL_PATH,
  CRS_URL,
  EE_LANGUAGE_URL,
  LEVEL_OPTIONS,
  SKILLS,
  crsLanguagePoints,
  levelOptionLabel
} from './crsLanguage.js';

const linkCls = 'text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]';

export const crsBreadcrumbs = [
  { name: 'Home', path: '/' },
  { name: 'CRS language points', path: CRS_TOOL_PATH }
];

function dateLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className={`font-display ${ink} text-[26px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
      {children}
    </h2>
  );
}

const LANG = { en: { name: 'English', scheme: 'CLB' }, fr: { name: 'French', scheme: 'NCLC' } };
const EMPTY = { reading: '', listening: '', writing: '', speaking: '' };

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

function LevelInputs({ idPrefix, language, levels, onChange, points }) {
  const scheme = LANG[language].scheme;
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {SKILLS.map((s) => (
        <label key={s} htmlFor={`${idPrefix}-${s}`} className="flex flex-col gap-1.5 rounded-2xl border border-[#E7E1D7] bg-white px-4 py-3">
          <span className="text-[14px] font-semibold text-[#3B352F]">
            {SKILL_LABELS[s].en}
            {points ? <span className="float-right tabular-nums text-[#6B635A] font-normal">{points[s]} pts</span> : null}
          </span>
          <select
            id={`${idPrefix}-${s}`}
            value={levels[s]}
            onChange={(e) => onChange({ ...levels, [s]: e.target.value })}
            className="h-11 rounded-xl border border-[#D9D2C8] bg-white px-3 text-[16px] text-[#1A1714] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714]"
          >
            <option value="">Choose your {scheme} level</option>
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {levelOptionLabel(l, scheme)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function bonusText(r) {
  switch (r.frenchBonusCase) {
    case 'strongEnglish':
      return 'NCLC 7 or higher in all four French skills and CLB 5 or higher in all four English skills: 50 additional points.';
    case 'lowEnglish':
      return 'NCLC 7 or higher in all four French skills and CLB 4 or lower in English: 25 additional points.';
    case 'noEnglish':
      return 'NCLC 7 or higher in all four French skills and no English test: 25 additional points.';
    case 'mixedEnglish':
      return 'NCLC 7 or higher in all four French skills, with English at CLB 5 or higher in only some skills. IRCC’s table lists 50 points for CLB 5 or higher in all four English skills and 25 for CLB 4 or lower, so check this case with IRCC; no number is shown.';
    case 'incomplete':
      return 'You reach NCLC 7 in all four French skills. Enter all four English levels to see whether the 25 or 50-point case applies.';
    default:
      return 'French additional points need NCLC 7 or higher in all four French skills.';
  }
}

function Calculator() {
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

  return (
    <section aria-labelledby="calc-title" className="mt-10 rounded-3xl border border-[#E7E1D7] bg-white/80 p-5 sm:p-8 shadow-[0_30px_60px_-40px_rgba(26,23,20,0.35)]">
      <h2 id="calc-title" className="sr-only">Calculator</h2>
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">1. Your situation</p>
          <div className="mt-3 flex flex-col gap-3">
            <Toggle
              label="Spouse or common-law partner coming with you"
              options={[
                { id: 'no', title: 'Single, or partner not coming' },
                { id: 'yes', title: 'Partner coming with me' }
              ]}
              value={spouse}
              onChange={setSpouse}
            />
            <Toggle
              label="First official language"
              options={[
                { id: 'en', title: 'First language: English' },
                { id: 'fr', title: 'First language: French' }
              ]}
              value={firstLang}
              onChange={swap}
            />
          </div>
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">
            2. {LANG[firstLang].name} ({LANG[firstLang].scheme}), first official language
          </p>
          <LevelInputs idPrefix="first" language={firstLang} levels={firstLv} onChange={setFirstLv} points={r.first.perSkill} />
        </div>
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">
            3. {LANG[secondLang].name} ({LANG[secondLang].scheme}), second official language
          </p>
          <div className="mt-3">
            <Toggle
              label={`Do you have a ${LANG[secondLang].name} test result?`}
              options={[
                { id: 'yes', title: `I have a ${LANG[secondLang].name} result` },
                { id: 'no', title: 'No second language test' }
              ]}
              value={hasSecond}
              onChange={setHasSecond}
            />
          </div>
          {hasSecond === 'yes' ? (
            <LevelInputs idPrefix="second" language={secondLang} levels={secondLv} onChange={setSecondLv} points={r.second?.perSkill} />
          ) : null}
        </div>

        <div aria-live="polite" className="rounded-3xl bg-[#F1EDE5] px-5 sm:px-7 py-6">
          <p className={`text-[16px] font-semibold ${ink}`}>Your official-language CRS points</p>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[15px]">
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className={muted}>First official language</dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums" data-crs-first>
                {r.first.total} <span className="text-[14px] font-normal text-[#6B635A]">/ {r.first.max}</span>
              </dd>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className={muted}>Second official language</dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums" data-crs-second>
                {r.second ? r.second.total : 0} <span className="text-[14px] font-normal text-[#6B635A]">/ {CRS_SECOND_LANGUAGE_MAX[withSpouse ? 0 : 1]}</span>
              </dd>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3">
              <dt className={muted}>French additional points</dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums" data-crs-bonus>
                {r.frenchBonus} <span className="text-[14px] font-normal text-[#6B635A]">/ 50</span>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[16px]">
            Language total: <strong className="tabular-nums">{r.core.total + r.frenchBonus}</strong> points ({r.core.total} of {r.core.max} for official languages
            {r.frenchBonus ? `, plus ${r.frenchBonus} French additional points` : ''}).
          </p>
          {r.second?.capped ? (
            <p className={`mt-2 text-[14px] ${muted}`}>
              Your four second-language skills add up to {r.second.raw}, but IRCC caps the second official language at {r.second.max} points {withSpouse ? 'with' : 'without'} a spouse or partner.
            </p>
          ) : null}
          {anyFrench ? <p className={`mt-2 text-[14px] ${muted}`}>{bonusText(r)}</p> : null}
          <p className={`mt-2 text-[14px] ${muted}`}>
            Only the language parts of the CRS grid. Age, education, work experience, skill transferability and your partner’s factors aren’t calculated here.
          </p>
        </div>

        <div className="rounded-3xl bg-[#1A1714] px-5 sm:px-7 py-6 text-white">
          <p className="font-display text-[22px] sm:text-[26px] tracking-[-0.02em] font-medium leading-tight">Don’t know your CLB or NCLC level yet?</p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#D9D2C8]">
            Enter your IELTS, CELPIP, PTE Core, TEF Canada or TCF Canada scores in the converter. It uses IRCC’s own tables and shows the level for each skill.
          </p>
          <a href="/tools/clb-converter" className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold">
            Convert my scores to CLB <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>
      <p className="mt-5 text-[13px] leading-snug text-[#6B635A]">
        Not affiliated with IRCC. Points checked against canada.ca on {dateLabel(CRS_LAST_VERIFIED)}. No guarantee about your CRS score or an invitation. Nothing you type leaves your device.
      </p>
    </section>
  );
}

function PointsTable({ caption, region, rows, maxNote }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714] focus-visible:ring-offset-2" tabIndex={0} role="region" aria-label={region}>
      <table className="w-full text-left text-[15px] leading-snug">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-[#F1EDE5] text-[#3B352F]">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Level per ability</th>
            <th scope="col" className="px-4 py-3 font-semibold">With a spouse or partner</th>
            <th scope="col" className="px-4 py-3 font-semibold">Without a spouse or partner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[#EEE8DE]">
              <th scope="row" className="px-4 py-2.5 font-medium">{r.label}</th>
              <td className="px-4 py-2.5 tabular-nums">{r.points[0]}</td>
              <td className="px-4 py-2.5 tabular-nums">{r.points[1]}</td>
            </tr>
          ))}
          <tr className="border-t border-[#EEE8DE] bg-[#FAF7F2]">
            <th scope="row" className="px-4 py-2.5 font-semibold">Maximum</th>
            <td className="px-4 py-2.5 tabular-nums font-semibold">{maxNote[0]}</td>
            <td className="px-4 py-2.5 tabular-nums font-semibold">{maxNote[1]}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function CrsLanguagePoints() {
  const checked = dateLabel(CRS_LAST_VERIFIED);
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={crsBreadcrumbs} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>Free tool · IRCC’s CRS grid</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-[56px] tracking-[-0.03em] font-medium leading-[1.05]`}>{CRS_TOOL_H1}</h1>
            <p className={`mt-6 ${lead}`}>
              Express Entry gives CRS points for your first official language and, separately, for your second. French at NCLC 7 or higher also earns additional points. Choose your CLB (English) and NCLC (French) level for each skill and see the points from IRCC’s CRS grid, checked on {checked}.
            </p>
          </header>

          <Calculator />

          <section aria-labelledby="second-title" className="mt-14 max-w-3xl">
            <SectionTitle id="second-title">Second official language points</SectionTitle>
            <p className={`mt-4 ${lead}`}>
              IRCC gives up to 6 points per ability for the second official language, with a combined maximum of {CRS_SECOND_LANGUAGE_MAX[0]} points with a spouse or common-law partner and {CRS_SECOND_LANGUAGE_MAX[1]} without. Four skills at CLB 9 or more add up to 24, so with a partner the {CRS_SECOND_LANGUAGE_MAX[0]}-point cap applies.
            </p>
            <PointsTable
              caption="CRS points per ability for the second official language"
              region="IRCC CRS second official language points table"
              rows={CRS_SECOND_LANGUAGE_ROWS}
              maxNote={CRS_SECOND_LANGUAGE_MAX}
            />
          </section>

          <section aria-labelledby="first-title" className="mt-14 max-w-3xl">
            <SectionTitle id="first-title">First official language points</SectionTitle>
            <p className={`mt-4 ${lead}`}>
              For comparison, the first official language earns far more per ability: up to 32 with a spouse or partner and 34 without, for a maximum of {CRS_FIRST_LANGUAGE_MAX[0]} or {CRS_FIRST_LANGUAGE_MAX[1]}. With the second language, official languages are worth up to {CRS_LANGUAGE_CORE_MAX[0]} or {CRS_LANGUAGE_CORE_MAX[1]} core CRS points.
            </p>
            <PointsTable
              caption="CRS points per ability for the first official language"
              region="IRCC CRS first official language points table"
              rows={CRS_FIRST_LANGUAGE_ROWS}
              maxNote={CRS_FIRST_LANGUAGE_MAX}
            />
          </section>

          <section aria-labelledby="bonus-title" className="mt-14 max-w-3xl">
            <SectionTitle id="bonus-title">French additional points</SectionTitle>
            <ul className={`mt-4 space-y-2 list-disc pl-5 text-[16px] leading-relaxed ${muted}`}>
              <li>NCLC 7 or higher on all four French skills and CLB 4 or lower in English (or no English test): <strong className={ink}>25 points</strong>.</li>
              <li>NCLC 7 or higher on all four French skills and CLB 5 or higher on all four English skills: <strong className={ink}>50 points</strong>.</li>
            </ul>
            <p className={`mt-3 text-[15px] ${muted}`}>
              These come from IRCC’s “Additional points” table and are added on top of the language points above.
            </p>
          </section>

          <section aria-labelledby="faq-title" className="mt-14 max-w-3xl">
            <SectionTitle id="faq-title">Questions people ask</SectionTitle>
            <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
              {CRS_TOOL_FAQ.map((f) => (
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
            <SectionTitle id="sources-title">Sources</SectionTitle>
            <ul className="mt-4 space-y-2 text-[16px]">
              <li>
                <a href={CRS_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  IRCC: Comprehensive Ranking System (CRS) criteria (first and second official language points, additional points)
                  <ArrowUpRight className="inline w-4 h-4 ml-1" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href={EE_LANGUAGE_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  IRCC: Express Entry language test results and CLB/NCLC tables
                  <ArrowUpRight className="inline w-4 h-4 ml-1" aria-hidden="true" />
                </a>
              </li>
            </ul>
            <p className={`mt-3 text-[14px] ${muted}`}>Checked on {checked}. OpenExam Hub is independent and not affiliated with IRCC.</p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <SectionTitle id="related-title">Related</SectionTitle>
            <ul className="mt-4 space-y-2 text-[16px]">
              <li><a href="/tools/clb-converter" className={linkCls}>CLB / NCLC score converter: IELTS, CELPIP, PTE Core, TEF Canada, TCF Canada</a></li>
              <li><a href="/compare/tef-vs-tcf" className={linkCls}>TEF Canada vs TCF Canada: NCLC scores side by side</a></li>
              <li><a href="/compare/clb-equivalency-table" className={linkCls}>CLB equivalency table for all five IRCC tests</a></li>
              <li><a href="/compare" className={linkCls}>All comparisons</a></li>
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
