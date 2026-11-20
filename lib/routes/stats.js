/**
 * GET /api/stats -> { stats, usage, usageTotal, treasury }
 *   stats       precomputed public numbers (stats/public, written by the nightly rollup).
 *               null until the first rollup.
 *   usage       live monthly AI token totals (stats/usage-YYYY-MM), no user data.
 *   usageTotal  lifetime AI token totals (stats/usage-total).
 *   treasury    current donation/ad ledger snapshot, for the public funding page.
 * CDN-cached 60 seconds so the usage counters stay reasonably live.
 */
import { cors } from '../http.js';
import { pub } from '../firebaseAdmin.js';
import { monthKey, presentTreasury, presentUsage, USAGE_TOTAL_ID, usageDocId } from '../usage.js';

const iso = (t) => (t?.toDate ? t.toDate().toISOString() : t instanceof Date ? t.toISOString() : typeof t === 'string' ? t : null);

function presentStats(d) {
  if (!d) return null;
  const plansBuilt = Number(d.plansBuilt) || 0;
  const cacheHits = Number(d.cacheHits) || 0;
  const sample = plansBuilt + cacheHits;
  const cacheHitRate =
    sample > 0
      ? (d.cacheHitRate != null && Number.isFinite(Number(d.cacheHitRate))
          ? Number(d.cacheHitRate)
          : Math.round((cacheHits / sample) * 1000) / 1000)
      : null;
  return { ...d, updatedAt: iso(d.updatedAt), cacheHitRate, plansBuilt, cacheHits };
}

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'Use GET.' });
    }
    const month = monthKey();
    const col = pub().collection('stats');
    const [publicSnap, usageSnap, totalSnap, ledgerSnap] = await Promise.all([
      col.doc('public').get(),
      col.doc(usageDocId(month)).get(),
      col.doc(USAGE_TOTAL_ID).get(),
      pub().collection('treasury').doc('monthly_ledger').get()
    ]);
    const stats = presentStats(publicSnap.exists ? publicSnap.data() : null);
    const usage = presentUsage(usageSnap.exists ? usageSnap.data() : null, month);
    const usageTotal = presentUsage(totalSnap.exists ? totalSnap.data() : null, null);
    const treasury = presentTreasury(ledgerSnap.exists ? ledgerSnap.data() : null);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return res.status(200).json({ stats, usage, usageTotal, treasury });
  } catch (err) {
    console.error('[stats]', err);
    return res.status(500).json({ error: 'Could not read the public stats.' });
  }
}
