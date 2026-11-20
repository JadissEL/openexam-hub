import React, { useMemo, useState } from 'react';
import { Brain, BookmarkPlus, BookmarkCheck, Eye, RotateCcw } from 'lucide-react';
import { newCard, nextReview, previewIntervals, dueQueue, retention } from '../lib/algo/srs.js';
import { fnv1a } from '../lib/algo/common.js';
import { examLabel } from '../lib/exams.js';

const STUDY = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'];
const UI = {
  label: 'text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500',
  primaryBtn: 'inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] hover:bg-neutral-800 text-white font-semibold transition',
  ghostBtn: 'inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white hover:bg-neutral-50 text-neutral-800 font-semibold transition'
};
const GRADE_UI = [
  { key: 'again', label: 'Again', cls: 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100' },
  { key: 'hard', label: 'Hard', cls: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' },
  { key: 'good', label: 'Good', cls: 'border-black/10 bg-white text-neutral-900 hover:bg-neutral-50' },
  { key: 'easy', label: 'Easy', cls: 'border-orange-200 bg-orange-50 text-[#9A3412] hover:bg-orange-100' }
];

export const fmtInterval = (d) => (d <= 0 ? '10 min' : d < 30 ? `${d} d` : d < 365 ? `${Math.round(d / 30)} mo` : `${(d / 365).toFixed(1)} y`);

/** Stable card id for a practice item (same item saved twice = same doc). */
export function cardIdFor(exam, item) {
  return `${String(exam).toUpperCase().replace(/[^A-Z0-9_-]/g, '')}_${fnv1a(`${item.prompt || ''}|${item.answer ?? item.modelAnswer ?? ''}`).toString(16).padStart(8, '0')}`;
}

/** Practice item -> SRS card document (only keys the Firestore rule allows). */
export function cardFromPractice(item, exam, skill, now = Date.now()) {
  const id = cardIdFor(exam, item);
  const options = Array.isArray(item.options) ? `\n${item.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '';
  const back = [item.modelAnswer ?? String(item.answer ?? ''), item.explanation || ''].filter(Boolean).join('\n\n');
  return {
    ...newCard(id, now),
    exam: String(exam).toUpperCase().slice(0, 24),
    ...(STUDY.includes(skill) ? { skill } : {}),
    front: `${item.prompt || ''}${options}`.slice(0, 1000),
    back: back.slice(0, 2000),
    source: 'practice',
    createdAt: now
  };
}

export function SaveToDeckButton({ saved, onSave, disabled }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saved || disabled}
      className={`${UI.ghostBtn} min-h-[44px] px-3.5 text-xs disabled:opacity-70`}
      title={disabled ? 'Sign-in is still loading' : undefined}
    >
      {saved ? <BookmarkCheck className="w-4 h-4 text-[#EA580C]" aria-hidden="true" /> : <BookmarkPlus className="w-4 h-4" aria-hidden="true" />}
      {saved ? 'In your review deck' : 'Save to review deck'}
    </button>
  );
}

/**
 * Spaced-repetition review (FSRS, lib/algo/srs.js). Cards live in users/{uid}/srs, one doc each;
 * the parent subscribes to them and persists graded cards via onGrade(updatedCard).
 */
export default function ReviewDeck({ exam, cards, onGrade, onReset }) {
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [, setTick] = useState(0);
  const now = Date.now();
  const queue = useMemo(() => dueQueue(cards, now, { limit: 50, newLimit: 10 }), [cards, sessionDone]); // eslint-disable-line react-hooks/exhaustive-deps
  const ret = useMemo(() => retention(cards, now), [cards, sessionDone]); // eslint-disable-line react-hooks/exhaustive-deps
  const card = queue[0];
  const preview = card ? previewIntervals(card, now, { fuzz: true }) : null;

  const grade = async (g) => {
    if (!card) return;
    const updated = nextReview(card, g, Date.now(), { fuzz: true });
    setRevealed(false);
    setSessionDone((n) => n + 1);
    await onGrade(updated);
    setTick((t) => t + 1);
  };

  return (
    <section aria-labelledby="oe-review-title" id="oe-review" className="bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)] p-5 sm:p-7 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${UI.label} flex items-center gap-1.5`}><Brain className="w-4 h-4 text-neutral-700" aria-hidden="true" />Review deck</p>
          <h2 id="oe-review-title" className="text-xl font-bold text-neutral-900 mt-1">Spaced repetition for {examLabel(exam)}</h2>
          <p className="text-sm text-neutral-600 mt-0.5">Cards come back right before you'd forget them. Save practice items below to add cards.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-[#F4F4F2] font-semibold text-neutral-700">{queue.length} due</span>
          <span className="px-2.5 py-1 rounded-full bg-[#F4F4F2] font-semibold text-neutral-700">{cards.length} card{cards.length === 1 ? '' : 's'}</span>
          {ret.overall != null && <span className="px-2.5 py-1 rounded-full bg-[#F4F4F2] font-semibold text-neutral-700">{Math.round(ret.overall * 100)}% recall</span>}
        </div>
      </div>

      {!card ? (
        <div className="p-6 rounded-3xl bg-[#FAFAF8] border border-black/5 text-center">
          <p className="font-semibold text-neutral-900">{cards.length ? 'All caught up' : 'Your deck is empty'}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {cards.length ? (sessionDone ? `You reviewed ${sessionDone} card(s). Come back later for the next ones.` : 'Nothing is due right now.') : 'Use "Save to review deck" on any practice item.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-black/5 bg-[#FAFAF8] p-4 sm:p-5">
          <p className="text-[11px] text-neutral-500 font-semibold uppercase tracking-[0.06em]">
            {card.state === 'new' ? 'New card' : card.state === 'relearning' || card.state === 'learning' ? 'Relearning' : 'Review'}
            {card.skill ? ` · ${card.skill}` : ''}
          </p>
          <p className="mt-2 text-sm sm:text-base text-neutral-900 whitespace-pre-line leading-relaxed">{card.front}</p>
          {revealed ? (
            <>
              <div className="mt-3 p-3 rounded-xl bg-white border border-black/5 text-sm text-neutral-700 whitespace-pre-line">{card.back || '—'}</div>
              <p className="mt-4 text-xs text-neutral-500">How well did you remember it?</p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GRADE_UI.map((g) => (
                  <button key={g.key} type="button" onClick={() => grade(g.key)} className={`min-h-[52px] rounded-2xl border px-3 py-2 text-sm font-semibold transition flex flex-col items-center justify-center ${g.cls}`}>
                    {g.label}
                    <span className="text-[11px] font-medium opacity-80">{fmtInterval(preview[g.key])}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setRevealed(true)} className={`${UI.primaryBtn} mt-4 min-h-[48px] px-5 text-sm w-full sm:w-auto`}>
              <Eye className="w-4 h-4" aria-hidden="true" />
              Show answer
            </button>
          )}
        </div>
      )}
      {onReset && cards.length > 0 && (
        <button type="button" onClick={onReset} className="text-xs font-semibold text-neutral-500 hover:text-neutral-800 inline-flex items-center gap-1 min-h-[44px]">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh deck
        </button>
      )}
    </section>
  );
}
