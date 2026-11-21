import React, { useState } from 'react';
import { PICKER_EXAMS, LEVELS, PLANNER_DAYS, DEFAULT_PICKER_EXAM, examLabel, parsePlannerQuery, parsePlannerDays, normalizeVariant } from '../lib/exams.js';
import { API_BASE, SERVER_ENABLED } from './firebaseConfig.js';
import { track } from './analytics.js';

// Signed-out plan preview on the /app gate. It only reads the public, CDN-cached shared plan cache
// (GET /api/plan: no account, no AI call, no writes). A hit shows the real plan read-only; a miss
// says honestly that this exact plan has not been built yet. Either way the choice is written to the
// URL (?exam=&level=&days=), so after sign-up the planner opens with it pre-selected.

const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// One option per exam, and one per variant for exams that have them (TCF tout public / TCF Canada).
const OPTIONS = PICKER_EXAMS.flatMap((x) =>
  x.variants?.length
    ? x.variants.map((v) => ({ value: `${x.id}:${v.id}`, exam: x.id, variant: v.id, label: `${v.label} (${v.short})` }))
    : [{ value: x.id, exam: x.id, variant: null, label: `${x.label}${x.short ? ` (${x.short})` : ''}` }]
);
const optionValue = (c) => (c.variant ? `${c.exam}:${c.variant}` : c.exam);
const choiceName = (c) => OPTIONS.find((o) => o.value === optionValue(c))?.label.replace(/ \(.*$/, '') || examLabel(c.exam);

function initialChoice() {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const q = parsePlannerQuery(search);
  const exam = q.exam || DEFAULT_PICKER_EXAM;
  let variant = null;
  try {
    variant = normalizeVariant(exam, new URLSearchParams(search).get('variant'));
  } catch {
    variant = null;
  }
  return { exam, variant, level: q.level || 'B2', days: parsePlannerDays(search) || 30 };
}

export function rememberChoice({ exam, variant, level, days }) {
  try {
    const params = new URLSearchParams(window.location.search);
    params.set('exam', exam);
    if (variant) params.set('variant', variant);
    else params.delete('variant');
    params.set('level', level);
    params.set('days', String(days));
    params.delete('band');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
  } catch {
    /* ignore */
  }
}

const selectCls =
  'mt-1 w-full min-h-[48px] rounded-xl border border-black/15 bg-white px-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-[#C2410C]';

export default function PlanPreview({ onSignUp, onSample }) {
  const [choice, setChoice] = useState(initialChoice);
  const [state, setState] = useState({ status: 'idle', roadmap: null });
  const set = (k) => (e) => {
    const v = e.target.value;
    setChoice((c) => {
      if (k === 'exam') {
        const o = OPTIONS.find((x) => x.value === v);
        return { ...c, exam: o ? o.exam : v, variant: o ? o.variant : null };
      }
      return { ...c, [k]: k === 'days' ? Number(v) : v };
    });
    setState({ status: 'idle', roadmap: null });
  };
  const label = `${choiceName(choice)} ${choice.level} · ${choice.days} days`;

  const preview = async (e) => {
    e.preventDefault();
    rememberChoice(choice);
    if (!SERVER_ENABLED) return setState({ status: 'miss', roadmap: null });
    setState({ status: 'loading', roadmap: null });
    try {
      const qs = new URLSearchParams({ exam: choice.exam, level: choice.level, days: String(choice.days), ...(choice.variant ? { variant: choice.variant } : {}) });
      const res = await fetch(`${API_BASE}/api/plan?${qs}`, { headers: { Accept: 'application/json' } });
      if (res.status === 404) {
        track('plan_preview', { exam: choice.exam, level: choice.level, days: choice.days, result: 'miss' });
        return setState({ status: 'miss', roadmap: null });
      }
      const data = await res.json();
      if (!res.ok || !data?.roadmap || !Array.isArray(data.roadmap.phases)) throw new Error('bad response');
      track('plan_preview', { exam: choice.exam, level: choice.level, days: choice.days, result: 'hit' });
      setState({ status: 'hit', roadmap: data.roadmap });
    } catch {
      setState({ status: 'error', roadmap: null });
    }
  };

  const save = () => {
    rememberChoice(choice);
    track('plan_preview_signup_click', { exam: choice.exam, level: choice.level, days: choice.days });
    onSignUp(choice);
  };

  const rm = state.roadmap;
  const resources = (rm?.verifiedResources || []).slice(0, 4);

  return (
    <div className="mt-6" data-testid="plan-preview">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#C2410C]">Preview · no account needed</p>
      <h1 className="mt-2 text-[26px] sm:text-3xl font-semibold tracking-tight leading-tight">See a plan before you sign up</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#5C554C]">
        Pick your exam. If other learners have already built this plan, you can read it right now.
      </p>

      <form onSubmit={preview} className="mt-5 grid grid-cols-2 gap-3">
        <label className="block col-span-2">
          <span className="text-sm font-medium">Exam</span>
          <select value={optionValue(choice)} onChange={set('exam')} className={selectCls}>
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Target level</span>
          <select value={choice.level} onChange={set('level')} className={selectCls}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Days left</span>
          <select value={choice.days} onChange={set('days')} className={selectCls}>
            {PLANNER_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={state.status === 'loading'}
          className="col-span-2 min-h-[48px] rounded-full border border-black/10 bg-white font-semibold text-[15px] disabled:opacity-60"
        >
          {state.status === 'loading' ? 'Looking…' : 'Preview this plan'}
        </button>
      </form>

      {state.status === 'hit' && rm && (
        <div className="mt-6" data-testid="plan-preview-result">
          <h2 className="text-xl font-semibold tracking-tight">{label}</h2>
          {rm.summary && <p className="mt-2 text-[15px] leading-relaxed text-[#5C554C]">{rm.summary}</p>}
          {resources.length > 0 && (
            <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
              <h3 className="font-semibold text-[15px]">Free official sources in this plan</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-[#3B352F]">
                {resources.map((r) => (
                  <li key={r.id || r.url}>
                    {r.title} <span className="text-[#6B635A]">· {domainOf(r.url)}</span>
                    {r.linkStatus === 'ok' && <span className="ml-1 text-emerald-700">· link checked</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ol className="mt-4 space-y-3">
            {(rm.phases || []).slice(0, 3).map((ph) => (
              <li key={ph.phaseTitle} className="rounded-2xl border border-black/5 bg-white p-4">
                <h3 className="font-semibold text-[15px]">{ph.phaseTitle}</h3>
                {ph.focus && <p className="mt-1 text-sm text-[#5C554C]">{ph.focus}</p>}
                <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-[#3B352F]">
                  {(ph.tasks || []).slice(0, 2).map((t) => {
                    const text = typeof t === 'string' ? t : t.title;
                    return <li key={text}>{text}</li>;
                  })}
                </ul>
              </li>
            ))}
          </ol>
          {(rm.phases || []).length > 3 && (
            <p className="mt-3 text-sm text-[#6B635A]">…and {(rm.phases || []).length - 3} more phases, with a day-by-day checklist.</p>
          )}
          <button
            type="button"
            onClick={save}
            className="mt-5 w-full min-h-[52px] rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold text-[16px]"
          >
            Save this plan and track progress (free)
          </button>
          <p className="mt-2 text-center text-xs text-[#6B635A]">A free account keeps your ticks and re-paces the plan if you fall behind.</p>
        </div>
      )}

      {(state.status === 'miss' || state.status === 'error') && (
        <div className="mt-6 rounded-2xl border border-black/5 bg-white p-4" data-testid="plan-preview-miss" role="status">
          <p className="text-[15px] leading-relaxed text-[#3B352F]">
            {state.status === 'miss'
              ? `Nobody has built a ${label} plan yet. Create a free account and it’s built for you from official free sources, with every link checked.`
              : 'We couldn’t load the preview just now. You can still create your free account and build the plan.'}
          </p>
          <button
            type="button"
            onClick={save}
            className="mt-4 w-full min-h-[52px] rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold text-[16px]"
          >
            Build my {choiceName(choice)} plan (free account)
          </button>
          {onSample && (
            <button type="button" onClick={onSample} className="mt-3 w-full text-sm text-[#C2410C] underline underline-offset-4">
              Or see a sample TEF Canada plan
            </button>
          )}
        </div>
      )}

      <p className="mt-6 text-center text-sm">
        <button type="button" onClick={() => onSignUp(null)} className="underline underline-offset-4 text-[#5C554C]">
          Back to sign up
        </button>
      </p>
    </div>
  );
}
