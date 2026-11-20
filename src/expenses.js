/**
 * Public expense ledger. Add a new entry here when a real, sourced cost is paid.
 * Never invent amounts. If the price is not yet known, set amount to null and
 * status to "pending" — the site will show "amount pending".
 *
 * Fields:
 *   id        stable slug (do not reuse)
 *   date      ISO date the cost was incurred (YYYY-MM-DD)
 *   item      short public description
 *   amount    number in `currency`, or null if pending
 *   currency  ISO 4217 code (EUR, USD, …)
 *   amountEur euro amount used in totals (null if pending). For non-EUR costs,
 *             convert with a documented rate and fill `fx`.
 *   fx        optional { rate, quote, source } — rate is units of `currency` per EUR
 *             (ECB style: 1 EUR = rate USD)
 *   kind      'one-off' | 'monthly'
 *   source    public note naming the receipt, invoice or API check
 *   status    'recorded' | 'pending'
 *
 * Recurring costs are listed at €0 only when the plan has been verified as free.
 * Vercel and Firebase are omitted until their plan or invoices are verified.
 */
export const ECB_USD_PER_EUR_2026_11_20 = 1.0990;
// 8.50 / 1.0990 = 7.7343… → €7.73
export const DOMAIN_AMOUNT_USD = 8.5;
export const DOMAIN_AMOUNT_EUR = 7.73;

export const EXPENSES = [
  {
    id: 'domain-openexamhub-org-2026',
    date: '2026-11-20',
    item: 'Domain openexamhub.org, one year on Cloudflare Registrar (until 20 November 2027)',
    amount: DOMAIN_AMOUNT_USD,
    currency: 'USD',
    amountEur: DOMAIN_AMOUNT_EUR,
    fx: {
      rate: ECB_USD_PER_EUR_2026_11_20,
      quote: 'USD per EUR',
      source: 'ECB euro foreign exchange reference rate, 20 November 2026 (1 EUR = 1.0990 USD)'
    },
    kind: 'one-off',
    status: 'recorded',
    source:
      'Cloudflare invoice IN-90052887 for $8.50, emailed 20 November 2026 at 16:54 UTC, at the same moment as the registration confirmation for openexamhub.org. Auto-renew is off.'
  },
  {
    id: 'cloudflare-plan-free',
    date: '2026-11-20',
    item: 'Cloudflare website plan (Free)',
    amount: 0,
    currency: 'EUR',
    amountEur: 0,
    kind: 'monthly',
    status: 'recorded',
    source:
      'Cloudflare zone plan “Free Website”, price 0 USD, verified on 20 November 2026 through the Cloudflare API.'
  }
];

const round2 = (n) => Math.round(n * 100) / 100;

/** Sum of recorded euro amounts (pending entries are skipped). */
export function expensesTotalEur(entries = EXPENSES) {
  let sum = 0;
  let pending = 0;
  for (const e of entries) {
    if (e.status === 'pending' || e.amountEur == null || !Number.isFinite(Number(e.amountEur))) {
      pending += 1;
      continue;
    }
    sum += Number(e.amountEur);
  }
  return { totalEur: round2(sum), pending };
}

export function formatEur(n, { sign = false } = {}) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const abs = `€${Math.abs(v).toFixed(2)}`;
  if (!sign) return v < 0 ? `−${abs}` : abs;
  if (v > 0) return `+${abs}`;
  if (v < 0) return `−${abs}`;
  return abs;
}

export function formatMoney(amount, currency) {
  if (amount == null || !Number.isFinite(Number(amount))) return 'amount pending';
  const cur = String(currency || 'EUR').toUpperCase();
  if (cur === 'EUR') return formatEur(amount);
  if (cur === 'USD') return `$${Number(amount).toFixed(2)}`;
  return `${Number(amount).toFixed(2)} ${cur}`;
}

/**
 * Net = earnings − expenses − AI cost (all in EUR).
 * A negative net means the project is out of pocket so far.
 */
export function netBalanceEur(earningsEur, expenseEur, aiCostEur = 0) {
  const earn = Number(earningsEur) || 0;
  const exp = Number(expenseEur) || 0;
  const ai = Number(aiCostEur) || 0;
  return round2(earn - exp - ai);
}
