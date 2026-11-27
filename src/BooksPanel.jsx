import React, { useEffect, useState } from 'react';
import { API_BASE, SERVER_ENABLED } from './firebaseConfig.js';
import { FIVE_YEAR_GOAL_EUR } from './funding.js';
import { AI_FRUGALITY_INTRO, AI_FRUGALITY_POINTS, AI_FRUGALITY_TITLE } from './aiFrugality.js';
import { EXPENSES, expensesTotalEur, formatEur, formatMoney, netBalanceEur } from './expenses.js';
import { useT, useUnit } from './i18n/LocaleContext.jsx';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function earningsFromTreasury(treasury) {
  if (!treasury) return 0;
  const community =
    treasury.communityTotalEur != null && Number.isFinite(Number(treasury.communityTotalEur))
      ? Number(treasury.communityTotalEur)
      : (Number(treasury.githubSponsors) || 0) +
        (Number(treasury.githubOneTime) || 0) +
        (Number(treasury.openCollective) || 0) +
        (Number(treasury.koFiTips) || 0);
  return round2(community + (Number(treasury.adsenseBridge) || 0));
}

export async function fetchPublicBooks() {
  const res = await fetch(`${API_BASE}/api/stats`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return res.json();
}

/**
 * Build-time snapshot of GET /api/stats, baked into the prerendered /funding page by
 * scripts/prerender-pages.mjs (globalThis.__OEH_BOOKS__ = { fetchedAt, treasury, usage, usageTotal, stats }).
 * The server render and the first client render both read it, so hydration matches; the live fetch
 * then replaces it. Absent (build had no network) -> a neutral loading state, never made-up numbers.
 */
export function booksSnapshot() {
  const g = typeof globalThis !== 'undefined' ? globalThis.__OEH_BOOKS__ : null;
  if (!g || typeof g !== 'object' || !g.treasury || !g.usageTotal || typeof g.fetchedAt !== 'string') return null;
  return g;
}

export function usePublicBooks({ treasury: treasuryProp, usage: usageProp, usageTotal: usageTotalProp, stats: statsProp } = {}) {
  const [data, setData] = useState(() => {
    const snap = treasuryProp || usageProp ? null : booksSnapshot();
    return {
      treasury: treasuryProp || snap?.treasury || null,
      usage: usageProp || snap?.usage || null,
      usageTotal: usageTotalProp || snap?.usageTotal || null,
      stats: statsProp || snap?.stats || null,
      loaded: Boolean(treasuryProp || usageProp || snap),
      asOf: snap ? snap.fetchedAt : null,
      error: false
    };
  });

  useEffect(() => {
    if (treasuryProp || usageProp) {
      setData((d) => ({
        ...d,
        treasury: treasuryProp || d.treasury,
        usage: usageProp || d.usage,
        usageTotal: usageTotalProp || d.usageTotal,
        stats: statsProp || d.stats,
        loaded: true
      }));
    }
  }, [treasuryProp, usageProp, usageTotalProp, statsProp]);

  useEffect(() => {
    if (!SERVER_ENABLED) {
      setData((d) => ({ ...d, loaded: true }));
      return;
    }
    if (treasuryProp && usageProp) return;
    let cancelled = false;
    fetchPublicBooks()
      .then((out) => {
        if (cancelled) return;
        setData({
          treasury: out.treasury || null,
          usage: out.usage || null,
          usageTotal: out.usageTotal || null,
          stats: out.stats || null,
          loaded: true,
          asOf: null,
          error: false
        });
      })
      .catch(() => {
        // Keep a build snapshot if we have one; otherwise say the figures are unavailable (no fake zeros).
        if (!cancelled) setData((d) => ({ ...d, loaded: Boolean(d.asOf), error: !d.asOf }));
      });
    return () => {
      cancelled = true;
    };
  }, [SERVER_ENABLED, treasuryProp, usageProp]);

  return data;
}

function formatTokens(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-GB');
}

function cacheLine(stats) {
  if (!stats) return null;
  const built = Number(stats.plansBuilt) || 0;
  const hits = Number(stats.cacheHits) || 0;
  const sample = built + hits;
  const rate = stats.cacheHitRate;
  if (!(sample > 0) || rate == null || !Number.isFinite(Number(rate))) return null;
  const pct = Math.round(Number(rate) * 100);
  return `${pct}% of plans so far have been served from the shared cache (${hits.toLocaleString('en-GB')} of ${sample.toLocaleString('en-GB')}).`;
}

export function AiFrugality({ variant = 'page', stats }) {
  const funding = useUnit('landing:funding');
  const title = funding?.frugality?.title || AI_FRUGALITY_TITLE;
  const intro = funding?.frugality?.intro || AI_FRUGALITY_INTRO;
  const points = funding?.frugality?.points || AI_FRUGALITY_POINTS;
  const isPage = variant === 'page';
  const line = cacheLine(stats);
  return (
    <section aria-labelledby="ai-frugality-title" className={isPage ? 'mt-16 max-w-4xl' : ''}>
      <h3 id="ai-frugality-title" className={isPage ? 'font-display text-[22px] font-medium text-[#1A1714]' : 'text-xs font-bold uppercase tracking-wider text-neutral-500'}>
        {title}
      </h3>
      <p className={isPage ? 'mt-3 text-[17px] leading-[1.7] text-[#6B635A]' : 'mt-2 text-sm text-neutral-600'}>
        {intro}
        {line ? ` ${line}` : ''}
      </p>
      <dl className={isPage ? 'mt-6 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]' : 'mt-3 divide-y divide-black/5'}>
        {points.map((p) => (
          <div key={p.t} className={isPage ? 'py-4 grid sm:grid-cols-[11rem_1fr] gap-1 sm:gap-6' : 'py-2.5'}>
            <dt className={isPage ? 'text-[#1A1714] font-semibold text-[17px]' : 'text-sm font-semibold text-neutral-900'}>{p.t}</dt>
            <dd className={isPage ? 'text-[17px] leading-[1.65] text-[#6B635A]' : 'text-sm text-neutral-600 mt-0.5'}>{p.d}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function asOfLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Fixed UTC format so the server render and the hydrating client agree.
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function BooksPanel({ variant = 'page', treasury, usage, usageTotal, stats, earnings: earningsProp, loaded = true, error = false, asOf = null }) {
  const t = useT();
  const expenseCopy = useUnit('landing:expenses');
  const isPage = variant === 'page';
  const wrap = isPage ? 'text-[#1A1714]' : 'text-neutral-800';
  const muted = isPage ? 'text-[#6B635A]' : 'text-neutral-600';
  const h = isPage ? 'font-display text-[22px] font-medium text-[#1A1714]' : 'text-xs font-bold uppercase tracking-wider text-neutral-500';
  const box = isPage ? 'rounded-none' : 'rounded-xl border border-black/[0.08] p-4';

  const { totalEur: listedEur, pending } = expensesTotalEur();
  const aiCost = Number(usageTotal?.costEur) || 0;
  const earnings = earningsProp != null ? Number(earningsProp) : earningsFromTreasury(treasury);
  const net = netBalanceEur(earnings, listedEur, aiCost);
  const monthUsage = usage || { calls: 0, promptTokens: 0, completionTokens: 0, costEur: 0, month: null };

  const pendingText = error ? t('books.unavailable') : t('books.loading');
  const pendingCls = `mt-2 text-base font-medium ${muted}`;
  const valueCls = `mt-2 text-2xl font-bold tabular-nums ${isPage ? 'text-[#1A1714]' : 'text-neutral-900'}`;
  const asOfText = asOf ? asOfLabel(asOf) : null;

  return (
    <div className={`space-y-8 ${wrap}`}>
      {asOfText ? (
        <p className={`text-sm ${muted}`} data-testid="books-as-of">{t('books.asOf', { date: asOfText })}</p>
      ) : null}
      <div className={isPage ? 'grid md:grid-cols-3 gap-8 max-w-4xl' : 'grid grid-cols-1 gap-4'}>
        <div className={box}>
          <h3 className={h}>{t('books.earnings')}</h3>
          <p className={loaded ? valueCls : pendingCls}>{loaded ? formatEur(earnings) : pendingText}</p>
          <p className={`mt-1 text-sm ${muted}`}>
            {t('books.earningsNote')}
            {FIVE_YEAR_GOAL_EUR != null ? ` · ${t('books.goal', { amount: Number(FIVE_YEAR_GOAL_EUR).toLocaleString('en-GB') })}` : ''}.
          </p>
        </div>
        <div className={box}>
          <h3 className={h}>{t('books.expenses')}</h3>
          <p className={loaded ? valueCls : pendingCls}>{loaded ? formatEur(listedEur + aiCost) : pendingText}</p>
          <p className={`mt-1 text-sm ${muted}`}>
            Recorded costs plus AI usage{pending ? ` · ${pending} amount${pending === 1 ? '' : 's'} pending` : ''}.
          </p>
        </div>
        <div className={box}>
          <h3 className={h}>{t('books.net')}</h3>
          <p className={loaded ? valueCls : pendingCls}>{loaded ? formatEur(net, { sign: true }) : pendingText}</p>
          <p className={`mt-1 text-sm ${muted}`}>
            {loaded
              ? net < 0
                ? 'Earnings minus expenses. The project is out of pocket by this amount so far.'
                : net > 0
                  ? 'Earnings minus expenses. This is what remains after recorded costs.'
                  : 'Earnings minus expenses.'
              : 'Earnings minus expenses.'}
          </p>
        </div>
      </div>

      <section aria-labelledby="expenses-list-title" className={isPage ? 'max-w-4xl' : box}>
        <h3 id="expenses-list-title" className={h}>{t('books.expensesHeading')}</h3>
        <ul className={isPage ? 'mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]' : 'mt-3 divide-y divide-black/5'}>
          {EXPENSES.map((e, i) => {
            const copy = expenseCopy?.entries?.[i] || e;
            return (
            <li key={e.id} className={isPage ? 'py-4' : 'py-3'}>
              <div className="flex justify-between gap-4 items-baseline">
                <div className="min-w-0">
                  <p className={isPage ? 'font-semibold text-[17px]' : 'text-sm font-semibold text-neutral-900'}>{copy.item || e.item}</p>
                  <p className={`text-sm mt-1 ${muted}`}>
                    {e.date}
                    {' · '}
                    {e.kind === 'monthly' ? 'Monthly' : 'One-off'}
                    {e.currency !== 'EUR' && e.amount != null
                      ? ` · ${formatMoney(e.amount, e.currency)}${e.amountEur != null ? ` (${formatEur(e.amountEur)})` : ''}`
                      : ''}
                  </p>
                </div>
                <p className={`shrink-0 font-semibold tabular-nums ${isPage ? 'text-[17px]' : 'text-sm'}`}>
                  {e.status === 'pending' || e.amountEur == null ? t('books.pending') : formatEur(e.amountEur)}
                </p>
              </div>
              {(copy.source || e.source) ? <p className={`mt-2 text-xs leading-relaxed ${muted}`}>{copy.source || e.source}{e.fx?.source ? ` ${t('books.converted', { source: copy.fxSource || e.fx.source })}` : ''}</p> : null}
            </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ai-usage-title" className={isPage ? 'max-w-4xl' : box}>
        <h3 id="ai-usage-title" className={h}>AI usage this month</h3>
        <p className={`mt-2 text-sm ${muted}`}>
          {monthUsage.month ? `UTC month ${monthUsage.month}. ` : ''}
          Totals only — no account or personal data. Free-tier calls are counted as €0.
        </p>
        {loaded ? (
          <dl className={`mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 ${isPage ? '' : 'text-sm'}`}>
            <div>
              <dt className={muted}>Calls</dt>
              <dd className="font-semibold tabular-nums text-lg">{formatTokens(monthUsage.calls)}</dd>
            </div>
            <div>
              <dt className={muted}>Prompt tokens</dt>
              <dd className="font-semibold tabular-nums text-lg">{formatTokens(monthUsage.promptTokens)}</dd>
            </div>
            <div>
              <dt className={muted}>Completion tokens</dt>
              <dd className="font-semibold tabular-nums text-lg">{formatTokens(monthUsage.completionTokens)}</dd>
            </div>
            <div>
              <dt className={muted}>Cost</dt>
              <dd className="font-semibold tabular-nums text-lg">{formatEur(monthUsage.costEur)}</dd>
            </div>
          </dl>
        ) : (
          <p className={`mt-3 text-sm ${muted}`}>{error ? 'Usage is not available right now.' : 'Loading usage…'}</p>
        )}
        {aiCost > 0 && (Number(monthUsage.costEur) || 0) !== aiCost ? (
          <p className={`mt-3 text-sm ${muted}`}>Lifetime AI cost included in expenses: {formatEur(aiCost)}.</p>
        ) : null}
      </section>

      <AiFrugality variant={variant} stats={stats} />
    </div>
  );
}
