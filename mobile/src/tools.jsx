import { useMemo, useState } from 'react';
import {
  TABLES,
  SKILLS,
  SKILL_LABELS,
  convert,
  levelLabel
} from '@hub/src/tools/clbData.js';
import { TOOL_FAQ, TOOL_TABS, TOOL_LAST_VERIFIED } from '@hub/src/tools/clbContent.js';
import { CEFR_CONVERTERS, CEFR_TABS, CEFR_TOOL_FAQ, CEFR_LAST_VERIFIED, cefrFor } from '@hub/src/tools/cefrData.js';
import {
  CRS_TOOL_FAQ,
  CRS_LAST_VERIFIED,
  CRS_URL,
  LEVEL_OPTIONS,
  levelOptionLabel,
  crsLanguagePoints
} from '@hub/src/tools/crsLanguage.js';
import { useNav } from './nav.js';
import { External, Faq, RowLink, prettyDate } from './ui.jsx';

const CLB_MODES = [
  ['TEF_EXPRESS_ENTRY', 'TEF'],
  ['TCF_CANADA', 'TCF'],
  ['IELTS_GT', 'IELTS'],
  ['CELPIP_G', 'CELPIP'],
  ['PTE_CORE', 'PTE']
];

export function ToolsHome() {
  const { push } = useNav();
  return (
    <div className="stack">
      <header>
        <p className="eyebrow">Calculators</p>
        <h2 className="display" style={{ fontSize: '1.85rem' }}>Scores, in the tables the authorities publish.</h2>
        <p className="lead">These tools do not convert one exam’s score into another’s. They read the published table and stop there.</p>
      </header>
      <RowLink title="CLB / NCLC converter" detail="IELTS General Training, CELPIP-General, PTE Core, TEF Canada, TCF Canada" onClick={() => push({ name: 'clb', mode: 'TEF_EXPRESS_ENTRY' })} />
      <RowLink title="CEFR converter" detail="IELTS, CELPIP, PTE Academic and TCF, from each publisher’s own chart" onClick={() => push({ name: 'cefr' })} />
      <RowLink title="CRS language points" detail="First and second official language, plus the French bonus" onClick={() => push({ name: 'crs' })} />
      <h2 className="section-title">Compare</h2>
      <RowLink title="Compare tests side by side" detail="CLB tables, French diplomas, German exams" onClick={() => push({ name: 'compare' })} />
    </div>
  );
}

export function ClbTool({ mode, onMode }) {
  const active = TABLES[mode] ? mode : 'TEF_EXPRESS_ENTRY';
  const table = TABLES[active];
  const [scores, setScores] = useState({ reading: '', listening: '', writing: '', speaking: '' });
  const [withSpouse, setWithSpouse] = useState(false);
  const result = useMemo(() => convert(active, scores, { withSpouse }), [active, scores, withSpouse]);
  const scheme = table.scheme;
  return (
    <div className="stack">
      <header>
        <p className="eyebrow">CLB / NCLC · checked {prettyDate(TOOL_LAST_VERIFIED)}</p>
        <h2 className="display" style={{ fontSize: '1.7rem' }}>Convert a score with IRCC’s table</h2>
      </header>
      <div className="chips" role="tablist">
        {CLB_MODES.map(([id, label]) => (
          <button key={id} type="button" className="chip" aria-pressed={active === id || (id === 'TEF_EXPRESS_ENTRY' && active === 'TEF_NEW_699')} onClick={() => onMode(id)}>{label}</button>
        ))}
      </div>
      {active.startsWith('TEF') ? (
        <div className="chips">
          <button type="button" className="chip" aria-pressed={active === 'TEF_EXPRESS_ENTRY'} onClick={() => onMode('TEF_EXPRESS_ENTRY')}>Express Entry scale</button>
          <button type="button" className="chip" aria-pressed={active === 'TEF_NEW_699'} onClick={() => onMode('TEF_NEW_699')}>Score /699</button>
        </div>
      ) : null}
      <p className="note">{table.notice || table.label}</p>
      {SKILLS.map((skill) => {
        const cell = result.perSkill[skill];
        return (
          <label className="field" key={skill}>
            {SKILL_LABELS[skill].en}
            <input
              inputMode="decimal"
              value={scores[skill]}
              placeholder={table.step === 0.5 ? '6.5' : '0'}
              onChange={(e) => setScores((s) => ({ ...s, [skill]: e.target.value }))}
              aria-invalid={cell && !cell.ok && !cell.empty ? true : undefined}
            />
            {cell?.error ? <span className="warn">{cell.error}</span> : null}
            {cell?.ok ? <span className="good">{levelLabel(cell.level, scheme)}{cell.points != null && table.expressEntry ? ` · ${cell.points} CRS` : ''}</span> : null}
          </label>
        );
      })}
      <button type="button" className="chip" aria-pressed={withSpouse} onClick={() => setWithSpouse((v) => !v)}>
        {withSpouse ? 'With a spouse or partner' : 'Without a spouse or partner'}
      </button>
      {result.complete ? (
        <div className="card">
          <h3>Lowest {scheme}: {levelLabel(result.lowest, scheme)}</h3>
          {result.crs ? <p>First official language, these four skills: {result.crs.total} of {result.crs.max} CRS points.</p> : null}
          {result.frenchBonusEligible ? <p>All four skills are {scheme} 7 or higher, so the French additional points may apply. The CRS tool adds them.</p> : null}
          {!table.expressEntry ? <p>This scale is not the one IRCC says to enter in an Express Entry profile.</p> : null}
        </div>
      ) : null}
      <External href={table.sourceUrl}>{table.sourceLabel}</External>
      <Faq items={TOOL_FAQ.slice(0, 4)} />
    </div>
  );
}

export function CefrTool() {
  const [tab, setTab] = useState('IELTS');
  const [marks, setMarks] = useState(false);
  const [raw, setRaw] = useState('');
  const id = tab === 'TCF' && marks ? 'TCF_MARKS' : tab;
  const spec = CEFR_CONVERTERS[id];
  const result = raw.trim() ? cefrFor(id, raw) : null;
  return (
    <div className="stack">
      <header>
        <p className="eyebrow">CEFR · checked {prettyDate(CEFR_LAST_VERIFIED)}</p>
        <h2 className="display" style={{ fontSize: '1.7rem' }}>A score, and the CEFR level its publisher prints</h2>
      </header>
      <div className="chips">
        {CEFR_TABS.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={tab === t.id} onClick={() => { setTab(t.id); setRaw(''); }}>{t.title}</button>
        ))}
      </div>
      {tab === 'TCF' ? (
        <div className="chips">
          <button type="button" className="chip" aria-pressed={!marks} onClick={() => { setMarks(false); setRaw(''); }}>Points</button>
          <button type="button" className="chip" aria-pressed={marks} onClick={() => { setMarks(true); setRaw(''); }}>Speaking or writing /20</button>
        </div>
      ) : null}
      <label className="field">
        {spec.input.label}
        <input inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={`${spec.input.min}–${spec.input.max}`} />
      </label>
      {result && !result.ok && result.error !== 'empty' ? <p className="warn">{result.error}</p> : null}
      {result?.ok ? (
        <div className="card">
          <h3>{result.cefr ? `${result.approx ? 'About ' : ''}${result.cefr}` : 'No level on this table'}</h3>
          {result.note ? <p>{result.note}</p> : null}
          {result.cefr ? <p>From {spec.table.exam}’s published chart. This is not a conversion into another test.</p> : null}
        </div>
      ) : null}
      <div className="card">
        {spec.table.rows.map((r) => (
          <p key={r.cefr}><strong>{r.cefr}.</strong> {r.score}</p>
        ))}
        <p className="note">{spec.table.note}</p>
      </div>
      {spec.table.sources?.map((s) => <External key={s.url} href={s.url}>{s.label}</External>)}
      <Faq items={CEFR_TOOL_FAQ} />
    </div>
  );
}

const EMPTY_LEVELS = { reading: '', listening: '', writing: '', speaking: '' };

export function CrsTool() {
  const [withSpouse, setWithSpouse] = useState(false);
  const [firstLang, setFirstLang] = useState('en');
  const [secondOn, setSecondOn] = useState(false);
  const [first, setFirst] = useState(EMPTY_LEVELS);
  const [second, setSecond] = useState(EMPTY_LEVELS);
  const secondLang = firstLang === 'en' ? 'fr' : 'en';
  const result = crsLanguagePoints({
    first: { language: firstLang, levels: first },
    second: secondOn ? { language: secondLang, levels: second } : null,
    withSpouse
  });
  const scheme = (lang) => (lang === 'fr' ? 'NCLC' : 'CLB');
  const selects = (levels, setLevels, lang) => SKILLS.map((skill) => (
    <label className="field" key={skill}>
      {SKILL_LABELS[skill].en}
      <select value={levels[skill]} onChange={(e) => setLevels((s) => ({ ...s, [skill]: e.target.value }))}>
        <option value="">No result</option>
        {LEVEL_OPTIONS.map((n) => <option key={n} value={n}>{levelOptionLabel(n, scheme(lang))}</option>)}
      </select>
    </label>
  ));
  const bonusText = {
    none: null,
    noEnglish: `French additional points: ${result.frenchBonus}. NCLC 7 or higher in all four French skills, and no English test.`,
    strongEnglish: `French additional points: ${result.frenchBonus}. NCLC 7+ in French and CLB 5+ in all four English skills.`,
    lowEnglish: `French additional points: ${result.frenchBonus}. NCLC 7+ in French, and English at CLB 4 or lower in every skill.`,
    mixedEnglish: 'No French bonus is shown. IRCC’s table states the bonus when every English skill is CLB 5 or higher, or every English skill is CLB 4 or lower. This mix is neither, so check the CRS page.',
    incomplete: 'Enter all four skills of each test to see whether the French bonus applies.'
  }[result.frenchBonusCase];
  return (
    <div className="stack">
      <header>
        <p className="eyebrow">CRS · checked {prettyDate(CRS_LAST_VERIFIED)}</p>
        <h2 className="display" style={{ fontSize: '1.7rem' }}>Language points on the CRS grid</h2>
        <p className="lead">Official-language points only. Age, education and work are not part of this calculator.</p>
      </header>
      <button type="button" className="chip" aria-pressed={withSpouse} onClick={() => setWithSpouse((v) => !v)}>
        {withSpouse ? 'With a spouse or partner' : 'Without a spouse or partner'}
      </button>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={firstLang === 'en'} onClick={() => setFirstLang('en')}>English first</button>
        <button type="button" className="chip" aria-pressed={firstLang === 'fr'} onClick={() => setFirstLang('fr')}>French first</button>
      </div>
      <h2 className="section-title">First official language</h2>
      {selects(first, setFirst, firstLang)}
      <button type="button" className="chip" aria-pressed={secondOn} onClick={() => setSecondOn((v) => !v)}>
        {secondOn ? 'Second language included' : 'Add a second official language'}
      </button>
      {secondOn ? (
        <>
          <h2 className="section-title">Second official language ({secondLang === 'fr' ? 'French' : 'English'})</h2>
          {selects(second, setSecond, secondLang)}
        </>
      ) : null}
      <div className="card">
        <h3>{result.core.total} language points</h3>
        <p>First language {result.first.total} of {result.first.max}. {result.second ? `Second language ${result.second.total} of ${result.second.max}.` : 'No second language.'} Core maximum on this part of the grid: {result.core.max}.</p>
        {bonusText ? <p>{bonusText}</p> : null}
        <p className="note">This is not a full CRS score and it is not an invitation.</p>
      </div>
      <External href={CRS_URL}>IRCC: Comprehensive Ranking System criteria</External>
      <Faq items={CRS_TOOL_FAQ} />
    </div>
  );
}

export { TOOL_TABS };
