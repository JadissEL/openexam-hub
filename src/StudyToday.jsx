import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, CalendarDays, TrendingUp, Gauge, Flag, ChevronDown, Brain, Clock } from 'lucide-react';
import { planDays, planProgress, currentDay, overdueTasks, TYPE_LABEL } from './lib/plan.js';

// Same surfaces as App.jsx THEME (neutral cards, warm orange accent, 44px+ touch targets).
const UI = {
  label: 'text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500',
  chip: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-black/5 text-xs font-semibold text-neutral-700',
  ghostBtn: 'inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white hover:bg-neutral-50 text-neutral-800 font-semibold transition'
};
const SKILL_LABEL = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking', grammar: 'Grammar', vocabulary: 'Vocabulary', mixed: 'Mixed', exam_format: 'Exam format', mock_exam: 'Mock exam' };
const fmtDate = (iso) => {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return iso; }
};
const dateOfDay = (rm, day) => {
  const s = Date.parse(`${String(rm.createdAt).slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(s) ? new Date(s + (day - 1) * 864e5).toISOString().slice(0, 10) : null;
};

function TaskRow({ task, checked, onToggle, resource }) {
  return (
    <li>
      <div className={`flex items-start gap-3 rounded-2xl border p-3 sm:p-3.5 transition ${checked ? 'border-orange-200 bg-orange-50/60' : 'border-black/5 bg-white'}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={checked ? `Mark not done: ${task.text}` : `Mark done: ${task.text}`}
          onClick={onToggle}
          className="shrink-0 -m-1.5 p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full"
        >
          {checked ? <CheckCircle2 className="w-6 h-6 text-[#EA580C] oe-pop" aria-hidden="true" /> : <Circle className="w-6 h-6 text-neutral-300" aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <p className={`text-sm leading-snug ${checked ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{task.text}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
            {task.minutes > 0 && (
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />{task.minutes} min</span>
            )}
            {task.skill && <span>{SKILL_LABEL[task.skill] || task.skill}</span>}
            {resource?.url && (
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#C2410C] hover:text-[#9A3412] min-h-[28px]">
                Open resource <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * "Today" view for scheduled (v3) plans: today's tasks, a scrollable day strip, pace vs plan,
 * on-track status, catch-up list and per-skill readiness. All numbers come from lib/algo.
 */
export default function StudyToday({ roadmap, onToggle, dueCards = 0, onOpenReview, abilityScores, retentionBySkill }) {
  const days = useMemo(() => planDays(roadmap), [roadmap]);
  const today = currentDay(roadmap);
  const clampedToday = Math.min(Math.max(today, 1), days.length || 1);
  const [selected, setSelected] = useState(clampedToday);
  const [showMissed, setShowMissed] = useState(false);
  const stripRef = useRef(null);
  useEffect(() => setSelected(clampedToday), [roadmap?.id, clampedToday]);
  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-day="${selected}"]`);
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
  }, [selected]);

  const prog = useMemo(() => planProgress(roadmap, days, { abilityScores, retentionBySkill }), [roadmap, days, abilityScores, retentionBySkill]);
  const done = roadmap?.progress?.done || {};
  const resById = useMemo(() => new Map((roadmap?.verifiedResources || []).map((r) => [r.id, r])), [roadmap]);
  const missed = useMemo(() => overdueTasks(roadmap, days, clampedToday), [roadmap, days, clampedToday]);
  if (!days.length) return null;

  const day = days[selected - 1];
  const dayDone = day.tasks.filter((t) => t.key in done).length;
  const before = today < 1;
  const after = today > days.length;
  const statusTone = !prog || prog.insufficientHistory ? 'neutral' : prog.onTrack ? 'green' : 'amber';
  const statusText = !prog ? '' : prog.remaining === 0 ? 'All done' : prog.insufficientHistory ? 'Just started' : prog.onTrack ? 'On track' : 'Behind';

  const dayState = (d) => {
    const n = d.tasks.length;
    const k = d.tasks.filter((t) => t.key in done).length;
    if (k === n) return 'done';
    if (k > 0) return 'partial';
    if (d.day < clampedToday && !after) return 'missed';
    if (after) return 'missed';
    return 'todo';
  };

  return (
    <section aria-labelledby="oe-today-title" className="p-5 sm:p-7 border-b border-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${UI.label} flex items-center gap-1.5`}>
            <CalendarDays className="w-4 h-4 text-neutral-700" aria-hidden="true" />
            {selected === clampedToday && !before && !after ? 'Today' : 'Day view'}
          </p>
          <h3 id="oe-today-title" className="text-lg sm:text-xl font-bold mt-1 leading-tight">
            Day {selected} of {days.length}
            <span className="text-neutral-400 font-semibold"> · {TYPE_LABEL[day.type] || 'Study'}</span>
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {fmtDate(dateOfDay(roadmap, selected))} · about {day.minutes} min · {dayDone}/{day.tasks.length} done
          </p>
        </div>
        {prog && (
          <span
            className={`${UI.chip} ${statusTone === 'green' ? 'text-green-800 border-green-200 bg-green-50' : statusTone === 'amber' ? 'text-amber-800 border-amber-200 bg-amber-50' : ''}`}
            title="Decided by the pace model (EWMA + hysteresis), not by AI"
          >
            <span className={`w-2 h-2 rounded-full ${statusTone === 'green' ? 'bg-green-500' : statusTone === 'amber' ? 'bg-amber-500' : 'bg-neutral-400'}`} aria-hidden="true" />
            {statusText}
          </span>
        )}
      </div>

      {before && <p className="mt-3 text-sm text-neutral-600">Your plan starts on {fmtDate(dateOfDay(roadmap, 1))}. Here's a preview of day 1.</p>}
      {after && <p className="mt-3 text-sm text-neutral-600">The planned exam date has passed. Tick anything you finished, or build a fresh plan for a new date.</p>}

      {/* Day strip: swipe on phones, scroll on desktop. */}
      <div className="mt-4 -mx-5 sm:-mx-7 px-5 sm:px-7">
        <ol ref={stripRef} className="flex gap-1.5 overflow-x-auto pb-2 snap-x [scrollbar-width:thin]" aria-label="Plan days">
          {days.map((d) => {
            const st = dayState(d);
            const isSel = d.day === selected;
            const isToday = d.day === today;
            return (
              <li key={d.day} className="snap-center shrink-0" data-day={d.day}>
                <button
                  type="button"
                  onClick={() => setSelected(d.day)}
                  aria-pressed={isSel}
                  aria-label={`Day ${d.day}, ${TYPE_LABEL[d.type] || 'Study'}${d.skill ? ` (${SKILL_LABEL[d.skill] || d.skill})` : ''}, ${st}`}
                  className={`w-11 min-h-[52px] rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold border transition ${
                    isSel ? 'bg-[#111111] text-white border-[#111111]' : 'bg-white border-black/5 text-neutral-800 hover:bg-neutral-50'
                  } ${isToday && !isSel ? 'ring-2 ring-[#FF6B1A] ring-offset-1' : ''}`}
                >
                  <span>{d.day}</span>
                  <span
                    aria-hidden="true"
                    className={`w-1.5 h-1.5 rounded-full ${
                      st === 'done' ? 'bg-[#EA580C]' : st === 'partial' ? 'bg-amber-400' : st === 'missed' ? 'bg-red-400' : d.type === 'mock' ? 'bg-pink-400' : isSel ? 'bg-white/50' : 'bg-neutral-300'
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-neutral-500 flex flex-wrap gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />done</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />started</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />missed</span>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />mock exam</span>
        </p>
      </div>

      <ul className="mt-4 space-y-2.5">
        {day.tasks.map((t) => (
          <TaskRow key={t.key} task={t} checked={t.key in done} resource={t.resourceId ? resById.get(t.resourceId) : null} onToggle={() => onToggle(t)} />
        ))}
      </ul>

      {selected !== clampedToday && !before && (
        <button type="button" onClick={() => setSelected(clampedToday)} className={`${UI.ghostBtn} mt-3 min-h-[44px] px-4 text-sm`}>
          Back to today
        </button>
      )}

      {/* Review queue entry point */}
      {onOpenReview && (
        <button
          type="button"
          onClick={onOpenReview}
          className="mt-4 w-full flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-[#FAFAF8] hover:bg-white p-3.5 min-h-[56px] text-left transition"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#111111] text-white flex items-center justify-center shrink-0"><Brain className="w-4 h-4" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-900">Review deck</span>
              <span className="block text-xs text-neutral-500 truncate">{dueCards > 0 ? `${dueCards} card${dueCards > 1 ? 's' : ''} due now (spaced repetition)` : 'No cards due. Save practice items to build your deck.'}</span>
            </span>
          </span>
          {dueCards > 0 && <span className="shrink-0 min-w-[28px] h-7 px-2 rounded-full bg-[#EA580C] text-white text-xs font-bold flex items-center justify-center">{dueCards}</span>}
        </button>
      )}

      {/* Pace vs plan */}
      {prog && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="rounded-2xl bg-[#FAFAF8] border border-black/5 p-3.5">
            <p className={`${UI.label} flex items-center gap-1`}><Gauge className="w-3.5 h-3.5" aria-hidden="true" />Progress</p>
            <p className="mt-1 text-lg font-bold">{Math.round(prog.actualPct)}%<span className="text-xs font-semibold text-neutral-500"> vs {Math.round(prog.expectedPct)}% planned</span></p>
            <div className="mt-2 h-2 rounded-full bg-[#EFEFEC] overflow-hidden relative" aria-hidden="true">
              <div className="h-full bg-[#FF6B1A]" style={{ width: `${Math.min(100, prog.actualPct)}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-[#111111]" style={{ left: `${Math.min(100, prog.expectedPct)}%` }} />
            </div>
          </div>
          <div className="rounded-2xl bg-[#FAFAF8] border border-black/5 p-3.5">
            <p className={`${UI.label} flex items-center gap-1`}><TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />Pace</p>
            <p className="mt-1 text-lg font-bold">{prog.pace.toFixed(1)}<span className="text-xs font-semibold text-neutral-500"> tasks/day</span></p>
            <p className="text-xs text-neutral-500">{prog.remaining ? `${prog.requiredPace.toFixed(1)}/day needed to finish on time` : 'Plan complete'}</p>
          </div>
          <div className="rounded-2xl bg-[#FAFAF8] border border-black/5 p-3.5">
            <p className={`${UI.label} flex items-center gap-1`}><Flag className="w-3.5 h-3.5" aria-hidden="true" />Projected finish</p>
            <p className="mt-1 text-lg font-bold">{prog.projectedFinishDate ? fmtDate(prog.projectedFinishDate) : '—'}</p>
            <p className="text-xs text-neutral-500">
              {prog.lateByDays == null ? 'Tick a few tasks to see a projection' : prog.lateByDays > 0 ? `${prog.lateByDays} day(s) after your exam` : 'On or before your exam'}
            </p>
          </div>
        </div>
      )}

      {/* Catch-up */}
      {missed.length > 0 && !before && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
          <button type="button" onClick={() => setShowMissed((v) => !v)} aria-expanded={showMissed} className="w-full min-h-[44px] flex items-center justify-between gap-2 text-left">
            <span className="text-sm font-semibold text-neutral-900">{missed.length} open task{missed.length > 1 ? 's' : ''} from earlier days</span>
            <ChevronDown className={`w-4 h-4 text-neutral-600 transition ${showMissed ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {showMissed && (
            <ul className="mt-2 space-y-2">
              {missed.slice(0, 12).map((t) => (
                <TaskRow key={t.key} task={{ ...t, text: `Day ${t.day} — ${t.text}` }} checked={false} resource={t.resourceId ? resById.get(t.resourceId) : null} onToggle={() => onToggle(t)} />
              ))}
              {missed.length > 12 && <li className="text-xs text-neutral-500 px-1">…and {missed.length - 12} more. The progress coach below can rebalance them.</li>}
            </ul>
          )}
        </div>
      )}

      {/* Readiness by skill */}
      {prog?.readiness && Object.keys(prog.readiness.perSkill).length > 0 && (
        <div className="mt-5">
          <p className={UI.label}>Readiness by skill</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {Object.entries(prog.readiness.perSkill).map(([s, v]) => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-neutral-600 shrink-0">{SKILL_LABEL[s] || s}</span>
                <div className="flex-1 h-2 bg-[#EFEFEC] rounded-full overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-[#111111]" style={{ width: `${Math.round(v * 100)}%` }} />
                </div>
                <span className="w-9 text-right font-semibold">{Math.round(v * 100)}%</span>
              </div>
            ))}
          </div>
          {prog.readiness.weakest?.length > 0 && (
            <p className="mt-2 text-xs text-neutral-500">Focus next: {prog.readiness.weakest.map((s) => SKILL_LABEL[s] || s).join(' and ')}.</p>
          )}
        </div>
      )}
    </section>
  );
}
