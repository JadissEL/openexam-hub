import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { Breadcrumbs } from '../seo/ExamPages.jsx';
import {
  CEFR_CONVERTERS,
  CEFR_LAST_VERIFIED,
  CEFR_TABS,
  CEFR_TOOL_FAQ,
  CEFR_TOOL_H1,
  CEFR_TOOL_PATH,
  cefrFor
} from './cefrData.js';

const linkCls = 'text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]';

export const cefrBreadcrumbs = [
  { name: 'Home', path: '/' },
  { name: 'CEFR level converter', path: CEFR_TOOL_PATH }
];

const TAB_PARAM = { ielts: 'IELTS', celpip: 'CELPIP', pte: 'PTE_ACADEMIC', tcf: 'TCF' };

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

function Converter() {
  // Start on IELTS so the prerendered HTML and the first client render match; ?tab= applies after mount.
  const [tab, setTab] = useState('IELTS');
  const [tcfKind, setTcfKind] = useState('TCF_POINTS');
  const [score, setScore] = useState('');
  useEffect(() => {
    const t = TAB_PARAM[new URLSearchParams(window.location.search).get('tab')];
    if (t) setTab(t);
  }, []);
  const converterId = tab === 'TCF' ? tcfKind : tab;
  const c = CEFR_CONVERTERS[converterId];
  const result = useMemo(() => cefrFor(converterId, score), [converterId, score]);
  const choose = (id) => {
    if (id === tab) return;
    setTab(id);
    setScore('');
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const slug = Object.entries(TAB_PARAM).find(([, v]) => v === id)[0];
      window.history.replaceState(null, '', slug === 'ielts' ? CEFR_TOOL_PATH : `${CEFR_TOOL_PATH}?tab=${slug}`);
    }
  };

  return (
    <section aria-labelledby="tool-title" className="mt-10 rounded-3xl border border-[#E7E1D7] bg-white/80 p-5 sm:p-8 shadow-[0_30px_60px_-40px_rgba(26,23,20,0.35)]">
      <h2 id="tool-title" className="sr-only">Converter</h2>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">1. Pick your test</p>
        <Toggle label="Test" options={CEFR_TABS} value={tab} onChange={choose} />
        {tab === 'TCF' ? (
          <Toggle
            label="TCF score type"
            options={[
              { id: 'TCF_POINTS', title: 'Reading, listening, structures (points)' },
              { id: 'TCF_MARKS', title: 'Speaking or writing (/20)' }
            ]}
            value={tcfKind}
            onChange={(id) => {
              setTcfKind(id);
              setScore('');
            }}
          />
        ) : null}
        <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6B635A]">2. Enter your score</p>
        <label htmlFor="cefr-score" className="flex flex-col gap-1.5 max-w-sm">
          <span className="text-[15px] font-semibold text-[#3B352F]">{c.input.label}</span>
          <input
            id="cefr-score"
            inputMode="decimal"
            autoComplete="off"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder={`${c.input.min} to ${c.input.max}`}
            className="h-12 rounded-xl border border-[#D9D2C8] bg-white px-4 text-[17px] text-[#1A1714] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1714]"
          />
        </label>
        <div aria-live="polite" className="rounded-3xl bg-[#F1EDE5] px-5 sm:px-7 py-6">
          {!result.ok ? (
            <p className={`text-[16px] ${muted}`}>{result.error === 'empty' ? 'Your CEFR level shows here.' : result.error}</p>
          ) : result.cefr ? (
            <>
              <p className={`text-[15px] ${muted}`}>{c.table.exam} {result.value}{converterId === 'TCF_MARKS' ? '/20' : converterId === 'TCF_POINTS' ? ' points' : ''}</p>
              <p className={`mt-1 font-display ${ink} text-[40px] leading-none`} data-cefr-level>
                {result.approx ? `About ${result.cefr}` : result.cefr}
              </p>
              <p className={`mt-3 text-[14px] ${muted}`}>{c.table.note}</p>
            </>
          ) : (
            <>
              <p className={`text-[16px] font-semibold ${ink}`} data-cefr-level>No CEFR level on the published table</p>
              <p className={`mt-2 text-[14px] ${muted}`}>{result.note}</p>
            </>
          )}
        </div>
      </div>
      <p className="mt-5 text-[13px] leading-snug text-[#6B635A]">
        Not affiliated with any test owner. Tables checked on {dateLabel(CEFR_LAST_VERIFIED)}. A CEFR level is not a score in another test. Nothing you type leaves your device.
      </p>
    </section>
  );
}

function CefrTable({ table }) {
  return (
    <div className="mt-6">
      <h3 className={`text-[19px] font-semibold ${ink}`}>{table.exam}</h3>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70" tabIndex={0} role="region" aria-label={`${table.exam} to CEFR table`}>
        <table className="w-full text-left text-[15px] leading-snug">
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">CEFR</th>
              <th scope="col" className="px-4 py-3 font-semibold">{table.scoreLabel}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.cefr} className="border-t border-[#EEE8DE]">
                <th scope="row" className="px-4 py-2.5 font-semibold">{r.cefr}</th>
                <td className="px-4 py-2.5 tabular-nums">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-2 text-[14px] ${muted}`}>{table.note}</p>
      <ul className="mt-1 text-[14px] space-y-1">
        {table.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
              {s.label}
              <ArrowUpRight className="inline w-4 h-4 ml-1" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CefrConverter() {
  const checked = dateLabel(CEFR_LAST_VERIFIED);
  const tables = [CEFR_CONVERTERS.IELTS.table, CEFR_CONVERTERS.CELPIP.table, CEFR_CONVERTERS.PTE_ACADEMIC.table, CEFR_CONVERTERS.TCF_POINTS.table];
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <article className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
          <Breadcrumbs items={cefrBreadcrumbs} />
          <header className="mt-6 max-w-3xl">
            <p className={eyebrow}>Free tool · Published tables only</p>
            <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-[56px] tracking-[-0.03em] font-medium leading-[1.05]`}>{CEFR_TOOL_H1}</h1>
            <p className={`mt-6 ${lead}`}>
              Enter a score and see the CEFR level (A1 to C2) its test owner gives it: IELTS, CELPIP and Pearson for PTE Academic, and the TCF level grid Campus France publishes. When a table doesn’t place a score, the tool says so instead of guessing. Checked on {checked}.
            </p>
          </header>

          <Converter />

          <section aria-labelledby="tables-title" className="mt-14 max-w-3xl">
            <SectionTitle id="tables-title">The published tables</SectionTitle>
            <p className={`mt-4 ${lead}`}>Each table is quoted as its source states it. They are not conversions between tests.</p>
            {tables.map((t) => (
              <CefrTable key={t.id} table={t} />
            ))}
          </section>

          <section aria-labelledby="missing-title" className="mt-14 max-w-3xl">
            <SectionTitle id="missing-title">Tests not on this page</SectionTitle>
            <ul className={`mt-4 space-y-2 list-disc pl-5 text-[16px] leading-relaxed ${muted}`}>
              <li><strong className={ink}>TEF and TEF Canada:</strong> we found no score-to-CEFR table from CCI Paris Île-de-France. For Canada, IRCC gives NCLC levels for TEF Canada.</li>
              <li><strong className={ink}>PTE Core:</strong> Pearson aligns PTE Core to the Canadian Language Benchmarks, not the CEFR. Pearson’s CEFR table above is for PTE Academic.</li>
              <li><strong className={ink}>DELF, DALF, Goethe and telc:</strong> each certificate is awarded at one CEFR level, so the level is printed on it.</li>
            </ul>
            <p className={`mt-3 text-[15px] ${muted}`}>
              Applying in Canada? IRCC uses CLB and NCLC levels, not the CEFR: use the{' '}
              <a href="/tools/clb-converter" className="text-[#C2410C] underline underline-offset-4">CLB converter</a>.
            </p>
          </section>

          <section aria-labelledby="faq-title" className="mt-14 max-w-3xl">
            <SectionTitle id="faq-title">Questions people ask</SectionTitle>
            <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
              {CEFR_TOOL_FAQ.map((f) => (
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

          <div className="mt-14 max-w-3xl rounded-3xl bg-[#1A1714] px-5 sm:px-7 py-6 text-white">
            <p className="font-display text-[22px] sm:text-[26px] tracking-[-0.02em] font-medium leading-tight">Aiming for B2 or C1?</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#D9D2C8]">Build a free day-by-day study plan from official, free practice material.</p>
            <a href="/exams" className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold">
              Pick your exam <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>

          <section aria-labelledby="related-title" className="mt-14 max-w-3xl">
            <SectionTitle id="related-title">Related</SectionTitle>
            <ul className="mt-4 space-y-2 text-[16px]">
              <li><a href="/blog/ielts-to-cefr" className={linkCls}>IELTS to CEFR: which IELTS band matches B1, B2, C1 and C2</a></li>
              <li><a href="/compare/delf-vs-tcf" className={linkCls}>DELF vs TCF: levels, validity and acceptance</a></li>
              <li><a href="/compare/goethe-vs-telc" className={linkCls}>Goethe vs telc: German exams by CEFR level</a></li>
              <li><a href="/compare/ielts-vs-pte" className={linkCls}>IELTS vs PTE Core: CLB scores side by side</a></li>
              <li><a href="/tools/clb-converter" className={linkCls}>CLB / NCLC score converter for Canada</a></li>
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
