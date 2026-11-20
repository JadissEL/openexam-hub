/**
 * Donation ledger: the ONLY writer of treasury/monthly_ledger and ledger_events.
 * Webhook routes (api/webhooks/*) verify the sender, normalise the payload with the
 * parse* functions below, then call applyLedgerEvent(), which runs one Firestore
 * transaction that:
 *   1. returns early if ledger_events/{source}-{eventId} already exists (idempotent retries),
 *   2. rolls the month over (archives the previous month to treasury/{YYYY-MM}),
 *   3. applies the EUR delta to the right bucket, and
 *   4. tx.create()s the event doc, so a concurrent duplicate fails the commit (-> duplicate).
 *
 * monthly_ledger fields:
 *   month           'YYYY-MM' (UTC) the reset buckets belong to
 *   githubSponsors  active GitHub monthly recurring revenue, EUR. NOT reset monthly.
 *   githubOneTime   one-time GitHub sponsorships this month, EUR. Reset monthly.
 *   openCollective  Open Collective contributions this month, EUR. Reset monthly.
 *   koFiTips        Ko-fi donations + membership payments this month, EUR. Reset monthly.
 *   adsenseBridge   never touched here (manual / future job). Carried over as is.
 *   communityTotalEur  githubSponsors + githubOneTime + openCollective + koFiTips
 *   pendingFxEvents events this month recorded without a EUR rate (excluded from totals)
 *   updatedAt
 */
import { getDb, getPub } from './store.js';

export const SOURCES = {
  github: { label: 'GitHub Sponsors', field: 'githubSponsors' },
  github_one_time: { label: 'GitHub Sponsors', field: 'githubOneTime' },
  opencollective: { label: 'Open Collective', field: 'openCollective' },
  kofi: { label: 'Ko-fi', field: 'koFiTips' }
};
const RESET_FIELDS = ['githubOneTime', 'openCollective', 'koFiTips'];
const MONEY_FIELDS = ['githubSponsors', 'githubOneTime', 'openCollective', 'koFiTips'];

let nowFn = () => new Date();
/** Test seam: freeze the clock. Pass null to restore. */
export function setClockForTests(fn) {
  nowFn = fn || (() => new Date());
}

export const monthKey = (d) => d.toISOString().slice(0, 7);
const round2 = (n) => Math.round(n * 100) / 100;
const clip = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');

/**
 * Convert to EUR with env rates FX_<CUR>_EUR (EUR is always 1).
 * Returns null when the rate is missing or invalid — callers must then exclude the amount.
 */
export function toEur(amount, currency) {
  const cur = String(currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur) || !Number.isFinite(amount)) return null;
  if (cur === 'EUR') return round2(amount);
  const rate = Number(process.env[`FX_${cur}_EUR`]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return round2(amount * rate);
}

const ledgerRef = (pub) => pub.collection('treasury').doc('monthly_ledger');
const emptyLedger = (month) => ({ month, githubSponsors: 0, githubOneTime: 0, openCollective: 0, koFiTips: 0, adsenseBridge: 0, pendingFxEvents: 0 });

/** Pure: roll a ledger object into `month`. Returns { next, archive|null }. */
export function rollLedger(cur, month) {
  // A doc without `month` predates server-side ingestion (browser-written, untrusted): start clean,
  // keeping only the manually maintained adsenseBridge and unrelated counters.
  if (!cur || !cur.month) return { next: { ...(cur || {}), ...emptyLedger(month), adsenseBridge: Number(cur?.adsenseBridge) || 0 }, archive: null };
  const base = { ...emptyLedger(month), ...cur };
  for (const f of MONEY_FIELDS) base[f] = Number(base[f]) || 0;
  if (cur.month === month) return { next: base, archive: null };
  const archive = { ...base, archived: true };
  const next = { ...base, month, pendingFxEvents: 0 };
  for (const f of RESET_FIELDS) next[f] = 0;
  return { next, archive };
}

const totalOf = (l) => round2(MONEY_FIELDS.reduce((s, f) => s + (Number(l[f]) || 0), 0));

/**
 * @param {object} ev
 * @param {'github'|'github_one_time'|'opencollective'|'kofi'} ev.source
 * @param {string} ev.eventId        platform idempotency key (delivery GUID, message_id, tx uuid)
 * @param {number} ev.amountOriginal signed amount in the original currency (negative = cancellation/refund)
 * @param {string} ev.currency       ISO 4217
 * @param {string} ev.eventType      e.g. 'created', 'tier_changed', 'Donation'
 * @param {string} ev.contributor    already privacy-filtered display name
 * @param {string} [ev.note]         already privacy-filtered public note
 * @param {object} [ev.meta]         extra non-PII fields stored on the event
 * @returns {Promise<{duplicate: boolean, counted: boolean, amountEur: number|null, flags: string[], ledger?: object}>}
 */
export async function applyLedgerEvent(ev) {
  const src = SOURCES[ev.source];
  if (!src) throw new Error(`unknown ledger source ${ev.source}`);
  if (typeof ev.eventId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(ev.eventId)) throw new Error('invalid eventId');
  const db = await getDb();
  const pub = await getPub();
  const sourceKey = ev.source === 'github_one_time' ? 'github' : ev.source;
  const eventRef = pub.collection('ledger_events').doc(`${sourceKey}-${ev.eventId}`);
  const lRef = ledgerRef(pub);
  const now = nowFn();
  const month = monthKey(now);
  const currency = String(ev.currency || '').toUpperCase();
  const amountOriginal = round2(Number(ev.amountOriginal));
  const amountEur = toEur(amountOriginal, currency);
  const flags = [];
  if (amountEur === null) flags.push('missing_fx_rate');

  try {
    return await db.runTransaction(async (tx) => {
      const [evSnap, lSnap] = await Promise.all([tx.get(eventRef), tx.get(lRef)]);
      if (evSnap.exists) return { duplicate: true, counted: false, amountEur: evSnap.data().amountEur ?? null, flags: evSnap.data().flags || [] };

      const { next, archive } = rollLedger(lSnap.exists ? lSnap.data() : null, month);
      if (archive) tx.set(pub.collection('treasury').doc(archive.month), { ...archive, archivedAt: now });

      let counted = false;
      if (amountEur !== null) {
        const raw = round2(next[src.field] + amountEur);
        if (raw < 0) flags.push('clamped_at_zero'); // e.g. cancellation of a sponsorship that predates the webhook
        next[src.field] = Math.max(0, raw);
        counted = true;
      } else {
        next.pendingFxEvents = (Number(next.pendingFxEvents) || 0) + 1;
      }
      next.communityTotalEur = totalOf(next);
      next.updatedAt = now;
      tx.set(lRef, next);

      tx.create(eventRef, {
        source: src.label, // client feed compatibility
        sourceKey,
        eventId: ev.eventId,
        eventType: clip(ev.eventType, 40),
        contributor: clip(ev.contributor, 80) || 'Anonymous supporter',
        note: clip(ev.note, 280),
        amount: amountEur, // EUR, what the public feed shows; null when not converted
        amountEur,
        amountOriginal,
        currency,
        countedInTotal: counted,
        flags,
        month,
        date: now.toISOString().slice(0, 10),
        createdAt: now,
        ...(ev.meta && typeof ev.meta === 'object' ? { meta: ev.meta } : {})
      });
      return { duplicate: false, counted, amountEur, flags, ledger: next };
    });
  } catch (err) {
    // A concurrent delivery of the same event won the race: create() fails with ALREADY_EXISTS (gRPC 6).
    if (err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message))) {
      return { duplicate: true, counted: false, amountEur, flags };
    }
    throw err;
  }
}

/** Roll the month over even when no donation arrives (called by the daily cron). */
export async function ensureCurrentMonth() {
  const db = await getDb();
  const pub = await getPub();
  const lRef = ledgerRef(pub);
  const now = nowFn();
  const month = monthKey(now);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(lRef);
    const { next, archive } = rollLedger(snap.exists ? snap.data() : null, month);
    if (!archive && snap.exists) return { rolledOver: false, month };
    if (archive) tx.set(pub.collection('treasury').doc(archive.month), { ...archive, archivedAt: now });
    tx.set(lRef, { ...next, communityTotalEur: totalOf(next), updatedAt: now });
    return { rolledOver: Boolean(archive), month };
  });
}

// ---------------------------------------------------------------- GitHub Sponsors
/**
 * Normalise a verified `sponsorship` delivery. GitHub tier prices are always USD cents.
 * Returns { ignore: reason } or a ledger event (minus eventId, which is X-GitHub-Delivery).
 */
export function parseGithubSponsorship(payload) {
  const action = payload?.action;
  const sp = payload?.sponsorship;
  if (!sp || typeof action !== 'string') return { error: 'missing sponsorship or action' };
  if (['pending_cancellation', 'pending_tier_change', 'edited'].includes(action)) return { ignore: `${action} has no money effect` };
  const cents = (t) => (Number.isFinite(Number(t?.monthly_price_in_cents)) ? Number(t.monthly_price_in_cents) : null);
  const tier = sp.tier;
  const price = cents(tier);
  if (price === null) return { error: 'sponsorship.tier.monthly_price_in_cents missing' };
  const isPrivate = sp.privacy_level === 'private';
  const contributor = isPrivate ? 'Anonymous sponsor' : sp.sponsor?.login ? `@${sp.sponsor.login}` : 'Anonymous sponsor';
  const oneTime = tier.is_one_time === true;
  let deltaCents;
  if (action === 'created') deltaCents = price;
  else if (action === 'cancelled') deltaCents = oneTime ? 0 : -price;
  else if (action === 'tier_changed') {
    const from = cents(payload?.changes?.tier?.from);
    if (from === null) return { error: 'changes.tier.from.monthly_price_in_cents missing' };
    deltaCents = price - from;
  } else return { ignore: `unhandled action ${action}` };
  if (deltaCents === 0) return { ignore: `${action} with zero monthly delta` };
  return {
    source: oneTime ? 'github_one_time' : 'github',
    amountOriginal: deltaCents / 100,
    currency: 'USD',
    eventType: action,
    contributor,
    note: isPrivate ? '' : action === 'tier_changed' ? `Tier changed to ${clip(tier.name, 60)}` : clip(tier.name, 60),
    meta: { tierName: isPrivate ? null : clip(tier.name, 60), oneTime, privacy: isPrivate ? 'private' : 'public' }
  };
}

// ---------------------------------------------------------------- Ko-fi
export const KOFI_COUNTED_TYPES = ['Donation', 'Subscription'];

/** Parse the form-encoded body (`data=<json>`). Returns the parsed JSON object or null. */
export function parseKofiBody(raw) {
  try {
    const params = new URLSearchParams(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || ''));
    const data = params.get('data');
    if (!data) return null;
    const obj = JSON.parse(data);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** Normalise a verified Ko-fi payment. Never stores email or shipping data. */
export function parseKofiPayment(d) {
  if (typeof d.message_id !== 'string' || !d.message_id) return { error: 'message_id missing' };
  if (!KOFI_COUNTED_TYPES.includes(d.type)) return { ignore: `type ${d.type} is not counted (Donation and Subscription only)` };
  const amount = Number.parseFloat(d.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount invalid' };
  const isPublic = d.is_public === true || d.is_public === 'true';
  return {
    source: 'kofi',
    eventId: d.message_id,
    amountOriginal: amount,
    currency: d.currency || 'EUR',
    eventType: d.type,
    contributor: isPublic ? clip(d.from_name, 80) || 'Ko-fi supporter' : 'Anonymous supporter',
    note: isPublic ? clip(d.message, 280) : '',
    meta: {
      kofiTransactionId: typeof d.kofi_transaction_id === 'string' ? d.kofi_transaction_id.slice(0, 64) : null,
      isSubscriptionPayment: d.is_subscription_payment === true,
      tierName: isPublic ? clip(d.tier_name, 60) || null : null,
      public: isPublic
    }
  };
}

// ---------------------------------------------------------------- Open Collective
export const OC_GRAPHQL = 'https://api.opencollective.com/graphql/v2';
const OC_TX_QUERY = `query($id: String!) {
  transaction(transaction: { id: $id }) {
    id kind type isRefund createdAt
    amount { valueInCents currency }
    account { slug }
    fromAccount { name slug isIncognito }
  }
}`;

let ocFetch = (...a) => fetch(...a);
/** Test seam for the Open Collective GraphQL call. */
export function setOcFetchForTests(fn) {
  ocFetch = fn || ((...a) => fetch(...a));
}

/**
 * Open Collective webhooks are unsigned, so the payload is treated only as a hint:
 * the transaction is re-read by id from the public GraphQL API and only the API's
 * answer is counted. Returns { error, status } | { ignore } | ledger event.
 */
export async function confirmOpenCollectiveTransaction(payload) {
  if (payload?.type !== 'collective.transaction.created') return { ignore: `activity ${payload?.type} is not counted` };
  const t = payload?.data?.transaction || {};
  const id = typeof t.uuid === 'string' ? t.uuid : typeof t.id === 'string' ? t.id : null;
  if (!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) return { error: 'data.transaction.uuid missing', status: 400 };
  const slug = process.env.OPEN_COLLECTIVE_SLUG;
  if (!slug) return { error: 'OPEN_COLLECTIVE_SLUG is not configured', status: 503 };
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.OPEN_COLLECTIVE_API_TOKEN) headers['Personal-Token'] = process.env.OPEN_COLLECTIVE_API_TOKEN;
  let json;
  try {
    const res = await ocFetch(OC_GRAPHQL, { method: 'POST', headers, body: JSON.stringify({ query: OC_TX_QUERY, variables: { id } }), signal: AbortSignal.timeout(10000) });
    json = await res.json();
  } catch {
    return { error: 'Open Collective API unreachable', status: 503 };
  }
  const tx = json?.data?.transaction;
  if (!tx) {
    const notFound = (json?.errors || []).some((e) => e?.extensions?.code === 'NotFound');
    return notFound ? { error: 'transaction not found on Open Collective', status: 400 } : { error: 'Open Collective API error', status: 503 };
  }
  if (tx.account?.slug !== slug) return { ignore: `transaction belongs to ${tx.account?.slug}, not ${slug}` };
  if (!['CONTRIBUTION', 'ADDED_FUNDS'].includes(tx.kind)) return { ignore: `kind ${tx.kind} is not a contribution` };
  let sign;
  if (tx.type === 'CREDIT' && !tx.isRefund) sign = 1;
  else if (tx.type === 'DEBIT' && tx.isRefund) sign = -1; // refund of a contribution to us
  else return { ignore: `type ${tx.type} refund=${tx.isRefund} not counted` };
  const cents = Number(tx.amount?.valueInCents);
  if (!Number.isFinite(cents) || cents === 0) return { ignore: 'zero amount' };
  const incognito = tx.fromAccount?.isIncognito === true;
  return {
    source: 'opencollective',
    eventId: tx.id,
    amountOriginal: (sign * Math.abs(cents)) / 100,
    currency: tx.amount.currency,
    eventType: sign > 0 ? tx.kind : 'REFUND',
    contributor: sign < 0 ? 'Refund' : incognito ? 'Anonymous backer' : clip(tx.fromAccount?.name, 80) || 'Open Collective backer',
    note: '',
    meta: { ocKind: tx.kind, ocType: tx.type, confirmedVia: 'graphql_v2' }
  };
}
