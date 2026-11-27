import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, X as XIcon } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import { count } from '../analytics.js';
import {
  CRS_URL,
  EE_LANGUAGE_URL,
  FRENCH_BONUS,
  LAST_VERIFIED,
  SKILLS,
  SKILL_LABELS,
  START_UP_URL,
  TABLES,
  convert,
  levelLabel,
  maxScore,
  plannerHref,
  recommendedLevel
} from './clbData.js';
import { TOOL_FAQ, TOOL_H1, TOOL_PATH } from './clbContent.js';

const MODES = [
  { id: 'TEF_EXPRESS_ENTRY', tab: 'tef', title: 'TEF Canada' },
  { id: 'TCF_CANADA', tab: 'tcf', title: 'TCF Canada' }
];

function verifiedLabel() {
  const [y, m, d] = LAST_VERIFIED.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const toolBreadcrumbs = [
  { name: 'Home', path: '/' },
  { name: 'NCLC score converter', path: TOOL_PATH }
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
    <div role="group" aria-label={label} className="inline-flex w-full sm:w-fit sm:self-start rounded-full bg-[#EDE7DD] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 sm:flex-none h-11 px-5 rounded-full text-[15px] font-semibold transition-colors ${
            value === o.id ? 'bg-[#1A1714] text-white shadow-sm' : 'text-[#3B352F] hover:bg-white/60'
          }`}
        >
          {o.title}
        </button>
      ))}
    </div>
  );
}

function ReferenceTable({ table }) {
  return (
    <div className="mt-5 first:mt-0">
      <h3 className={`font-display ${ink} text-[20px] tracking-[-0.01em] font-medium`}>{table.label}</h3>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70">
        <table className="w-full text-left text-[15px] leading-snug">
          <caption className="sr-only">{table.label}: score ranges for each NCLC level</caption>
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">NCLC</th>
              {SKILLS.map((s) => (
                <th key={s} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">{SKILL_LABELS[s].en}</th>
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
                      {r.min === r.max ? r.min : `${r.min}–${r.max}`}
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
  const rows = [
    ['Less than CLB 4', 0, 0],
    ['CLB 4 or 5', 6, 6],
    ['CLB 6', 8, 9],
    ['CLB 7', 16, 17],
    ['CLB 8', 22, 23],
    ['CLB 9', 29, 31],
    ['CLB 10 or more', 32, 34]
  ];
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70">
      <table className="w-full text-left text-[15px] leading-snug">
        <caption className="sr-only">CRS points per ability for the first official language</caption>
        <thead className="bg-[#F1EDE5] text-[#3B352F]">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Level per ability</th>
            <th scope="col" className="px-4 py-3 font-semibold">With a spouse or partner</th>
            <th scope="col" className="px-4 py-3 font-semibold">Without</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E7E1D7]">
          {rows.map(([l, a, b]) => (
            <tr key={l}>
              <th scope="row" className={`px-4 py-2.5 font-semibold ${ink} whitespace-nowrap`}>{l}</th>
              <td className="px-4 py-2.5 tabular-nums">{a}</td>
              <td className="px-4 py-2.5 tabular-nums">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Meets({ ok, label, detail }) {
  return (
    <li className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${ok ? 'border-[#BFD9C4] bg-[#EEF7EF]' : 'border-[#E7C9B4] bg-[#FBF1E9]'}`}>
      <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-[#2F7D3B] text-white' : 'bg-[#C2410C] text-white'}`} aria-hidden="true">
        {ok ? <Check className="w-4 h-4" /> : <XIcon className="w-4 h-4" />}
      </span>
      <span className="text-[16px] leading-snug">
        <strong className={ink}>{label}: {ok ? 'yes' : 'not yet'}</strong>
        {detail ? <span className={`block text-[14px] ${muted}`}>{detail}</span> : null}
      </span>
    </li>
  );
}

function Converter() {
  const [mode, setMode] = useState('TEF_EXPRESS_ENTRY');
  const [scores, setScores] = useState({ reading: '', listening: '', writing: '', speaking: '' });
  const [spouse, setSpouse] = useState(false);
  const [touched, setTouched] = useState({});
  const counted = useRef(false);

  // Scores from one scale mean nothing on another, so switching test or scale starts a fresh form.
  const chooseMode = (id) => {
    if (id === mode) return;
    setMode(id);
    setScores({ reading: '', listening: '', writing: '', speaking: '' });
    setTouched({});
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
  const examName = table.exam === 'TCF_CANADA' ? 'TCF Canada' : 'TEF Canada';

  return (
    <section aria-labelledby="tool-title" className="mt-10 rounded-3xl border border-[#E7E1D7] bg-white/80 p-5 sm:p-8 shadow-[0_30px_60px_-40px_rgba(26,23,20,0.35)]">
      <h2 id="tool-title" className="sr-only">Converter</h2>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">1. Pick your test</p>
        <Segmented
          label="Test"
          options={MODES}
          value={mode === 'TCF_CANADA' ? 'TCF_CANADA' : 'TEF_EXPRESS_ENTRY'}
          onChange={(id) => {
            if (id === 'TEF_EXPRESS_ENTRY' && mode === 'TEF_NEW_699') return;
            chooseMode(id);
          }}
        />
        {mode !== 'TCF_CANADA' ? (
          <div className="mt-1">
            <label className="flex items-start gap-3 text-[15px] leading-snug text-[#3B352F]">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-[#C2410C]"
                checked={mode === 'TEF_NEW_699'}
                onChange={(e) => chooseMode(e.target.checked ? 'TEF_NEW_699' : 'TEF_EXPRESS_ENTRY')}
              />
              <span>
                My scores are on the new “Score / 699” scale (not for Express Entry)
                <span className={`block text-[14px] ${muted}`}>
                  For Express Entry, IRCC says to use the “Équivalence ancien score” column of your TEF Canada results instead. Leave this unticked for Express Entry.
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </div>

      <div className="mt-7">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">2. Enter your four scores</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {SKILLS.map((s) => {
            const r = result.perSkill[s];
            const showError = !r.ok && !r.empty && (touched[s] || String(scores[s]).length >= 3);
            const id = `clb-${s}`;
            return (
              <div key={s}>
                <label htmlFor={id} className={`block text-[15px] font-semibold ${ink}`}>
                  {SKILL_LABELS[s].en}
                  <span lang="fr" className="block text-[12px] font-normal text-[#6B635A] leading-tight">{SKILL_LABELS[s].fr}</span>
                </label>
                <input
                  id={id}
                  name={s}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={scores[s]}
                  placeholder={`max ${maxScore(tableId, s)}`}
                  aria-invalid={showError ? 'true' : undefined}
                  aria-describedby={`${id}-out`}
                  onChange={(e) => setScores((prev) => ({ ...prev, [s]: e.target.value.replace(/\s/g, '') }))}
                  onBlur={() => setTouched((t) => ({ ...t, [s]: true }))}
                  className={`mt-2 w-full h-12 rounded-xl border bg-white px-3 text-[18px] tabular-nums text-[#1A1714] placeholder:text-[#9A9288] placeholder:text-[15px] focus:outline-none focus:ring-2 focus:ring-[#C2410C]/40 ${showError ? 'border-[#B91C1C]' : 'border-[#D9D2C8]'}`}
                />
                <p id={`${id}-out`} className="mt-2 min-h-[1.5rem] text-[14px] leading-snug">
                  {r.ok ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold ${r.level >= 9 ? 'bg-[#EEF7EF] text-[#1F6B2C]' : r.level >= 7 ? 'bg-[#FBF1E9] text-[#9A3412]' : 'bg-[#F3EEE6] text-[#5C554C]'}`}>
                      {levelLabel(r.level)}
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
            {anyEntered ? 'Add the remaining scores to see your lowest level and the NCLC 7 and 9 check.' : 'Your level for each skill, and your lowest level overall, will show here as you type.'}
          </p>
        ) : (
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">Your result</p>
            <p className={`mt-2 font-display ${ink} text-[34px] sm:text-[44px] leading-[1.05] tracking-[-0.02em] font-medium`}>
              Lowest level: {levelLabel(level)}
            </p>
            <p className={`mt-2 text-[16px] ${muted}`}>
              IRCC looks at each ability separately, so your lowest skill sets the level you can claim for a minimum requirement.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              <Meets
                ok={result.meets7}
                label="Meets NCLC 7 (FSW minimum)"
                detail={result.meets7 ? 'All four abilities are NCLC 7 or higher.' : `Below 7: ${result.below7.map((s) => SKILL_LABELS[s].en).join(', ')}.`}
              />
              <Meets
                ok={result.meets9}
                label="Meets NCLC 9"
                detail={result.meets9 ? 'All four abilities are NCLC 9 or higher.' : `Below 9: ${result.below9.map((s) => SKILL_LABELS[s].en).join(', ')}.`}
              />
            </ul>

            {result.crs ? (
              <div className="mt-6 rounded-2xl border border-[#E7E1D7] bg-[#FBF9F5] p-4 sm:p-5">
                <p className={`text-[16px] font-semibold ${ink}`}>CRS points for your first official language</p>
                <div className="mt-3">
                  <Segmented
                    label="Family situation for CRS points"
                    options={[{ id: 'single', title: 'No spouse or partner' }, { id: 'spouse', title: 'With spouse or partner' }]}
                    value={spouse ? 'spouse' : 'single'}
                    onChange={(id) => setSpouse(id === 'spouse')}
                  />
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-2 text-[15px] sm:grid-cols-4">
                  {SKILLS.map((s) => (
                    <li key={s} className="rounded-xl bg-white px-3 py-2 border border-[#EDE7DD]">
                      <span className="block text-[13px] text-[#6B635A]">{SKILL_LABELS[s].en}</span>
                      <span className="text-[18px] font-semibold tabular-nums">{result.perSkill[s].points}</span>
                    </li>
                  ))}
                </ul>
                <p className={`mt-4 text-[17px] ${ink}`}>
                  Total: <strong className="tabular-nums">{result.crs.total}</strong> of {result.crs.max} points
                </p>
                <p className={`mt-2 text-[14px] leading-snug ${muted}`}>
                  First official language only. IRCC also adds {FRENCH_BONUS.lowEnglish} extra points when you reach NCLC 7 in all four French abilities and CLB 4 or lower in English (or no English test), or {FRENCH_BONUS.strongEnglish} if you also reach CLB 5 in all four English abilities.
                  {result.frenchBonusEligible ? ' You reach NCLC 7 in French, so the bonus can apply to you.' : ''} The rest of your CRS score (age, education, work experience…) isn’t calculated here.
                </p>
              </div>
            ) : (
              <p className={`mt-6 rounded-2xl border border-[#E7C9B4] bg-[#FBF1E9] px-4 py-3 text-[15px] leading-snug text-[#3B352F]`}>
                IRCC doesn’t accept the “Score / 699” scale in Express Entry profiles, so no CRS points are shown. For Express Entry, use the “Équivalence ancien score” column of your TEF Canada results.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 rounded-3xl bg-[#1A1714] px-5 sm:px-7 py-6 text-white">
          <p className="font-display text-[22px] sm:text-[26px] tracking-[-0.02em] font-medium leading-tight">
            {result.complete && result.meets9
              ? 'You’re at NCLC 9 or higher. Keep your edge sharp.'
              : result.complete && result.meets7
                ? 'You’re past NCLC 7. Next stop: NCLC 9.'
                : 'Close the gap with a free day-by-day plan.'}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#D9D2C8]">
            {result.complete
              ? `We’ll open a free ${examName} ${ctaLevel} plan (30 days) built from official, free material.`
              : `Opens a free ${examName} plan at ${ctaLevel} (30 days), built from official, free material. Enter your scores first and we’ll pick the level for you.`}
          </p>
          <a
            href={cta}
            data-clb-cta
            className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold"
          >
            Get a free study plan to reach CLB 7/9 <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      <p className="mt-5 text-[13px] leading-snug text-[#6B635A]">
        Not affiliated with IRCC. Tables checked on {verifiedLabel()}. Verify your level on{' '}
        <a href={mode === 'TEF_NEW_699' ? START_UP_URL : EE_LANGUAGE_URL} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4">canada.ca</a>.
        Nothing you type leaves your device.
      </p>
    </section>
  );
}

export default function ClbConverter() {
  const tef = TABLES.TEF_EXPRESS_ENTRY;
  const tcf = TABLES.TCF_CANADA;
  const tef699 = TABLES.TEF_NEW_699;
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={toolBreadcrumbs} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>Free tool · No account needed</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-[56px] tracking-[-0.03em] font-medium leading-[1.05]`}>{TOOL_H1}</h1>
            <p className={`mt-6 ${lead}`}>
              Enter your four scores and see your NCLC level for each skill, your lowest level overall, whether you meet NCLC 7 or 9, and the CRS language points they earn. It uses IRCC’s own tables from canada.ca, checked on {verifiedLabel()}.
            </p>
          </header>

          <Converter />

          <section aria-labelledby="how-title" className="mt-14 max-w-3xl">
            <SectionTitle id="how-title">What to enter</SectionTitle>
            <ul className={`mt-4 list-disc pl-5 space-y-2 text-[17px] leading-[1.7] ${muted}`}>
              <li><strong className={ink}>TEF Canada, for Express Entry:</strong> the numbers in the “Équivalence ancien score” column of your attestation de résultats. Don’t use the “Score / 699” column.</li>
              <li><strong className={ink}>TCF Canada:</strong> reading and listening are out of 699; speaking and writing are out of 20.</li>
              <li>NCLC 10 is the top band on IRCC’s tables, so any score from its lower limit up counts as NCLC 10.</li>
              <li>A score below the NCLC 4 band is reported as “Below NCLC 4”.</li>
            </ul>
          </section>

          <section aria-labelledby="tables-title" className="mt-14">
            <SectionTitle id="tables-title">IRCC score tables used by this tool</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>
              Copied from canada.ca and last checked on {verifiedLabel()}. Each range is the score that earns that NCLC level.
            </p>
            <div className="mt-6 space-y-9">
              <ReferenceTable table={tef} />
              <ReferenceTable table={tcf} />
              <ReferenceTable table={tef699} />
            </div>
          </section>

          <section aria-labelledby="crs-title" className="mt-14 max-w-3xl">
            <SectionTitle id="crs-title">CRS points for the first official language</SectionTitle>
            <p className={`mt-3 text-[16px] leading-[1.7] ${muted}`}>
              Express Entry’s Comprehensive Ranking System gives points for each of the four abilities. The table below is IRCC’s current “first official language” table: points per ability, up to 128 with a spouse or common-law partner and 136 without. NCLC 7 and NCLC 9 also matter for the CRS skill-transferability factors that combine language with education or foreign work experience.
            </p>
            <CrsTable />
          </section>

          <section aria-labelledby="exam-faq-title" className="mt-14">
            <SectionTitle id="exam-faq-title">Questions people ask</SectionTitle>
            <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7] max-w-3xl">
              {TOOL_FAQ.map((item) => (
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
              More answers about how OpenExam Hub works: <a href="/faq" className="text-[#C2410C] underline underline-offset-4">read the full FAQ</a>.
            </p>
          </section>

          <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
            <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Sources and disclaimer</h2>
            <ol className="mt-4 space-y-2 text-[16px] leading-snug">
              {[
                { url: EE_LANGUAGE_URL, label: 'IRCC: Express Entry, Language test results (TEF Canada “ancien score” and TCF Canada tables)' },
                { url: START_UP_URL, label: 'IRCC: Start-up visa, Language testing (TEF Canada “Score / 699” table, tests after 10 December 2023)' },
                { url: CRS_URL, label: 'IRCC: Comprehensive Ranking System (CRS) criteria (first official language points, French bonus)' }
              ].map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                    {s.label} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[14px] leading-relaxed text-[#6B635A]">
              Tables last verified on <time dateTime={LAST_VERIFIED}>{verifiedLabel()}</time>. OpenExam Hub is independent and not affiliated with IRCC, CCI Paris Île-de-France or France Éducation international. This tool is for information only and is not immigration advice. IRCC can change its tables and rules at any time, so verify your level and your program’s requirements on canada.ca before you apply.
            </p>
          </section>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Related guides</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              <li><a href="/exams/tef-canada" className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">TEF Canada guide: format, NCLC scores and free official practice</a></li>
              <li><a href="/exams/tcf-canada" className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">TCF Canada guide: format, timings and free official practice</a></li>
              <li><a href="/blog" className="text-[#C2410C] underline underline-offset-4">Read the blog</a></li>
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
