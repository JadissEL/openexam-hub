/**
 * GET /api/stats -> { stats, usage, usageTotal, treasury, registeredUsers }
 *   stats            public numbers. Library counts (resources, approvedResources, linkHealth,
 *                    byExam) are read live from the same `resources` collection as /api/library
 *                    and overlaid on the nightly rollup (plansBuilt, cache hits, fallbacks).
 *                    null until the first rollup if the live count also fails.
 *   usage            live monthly AI token totals (stats/usage-YYYY-MM), no user data.
 *   usageTotal       lifetime AI token totals (stats/usage-total).
 *   treasury         current donation/ad ledger snapshot, for the public funding page.
 *   registeredUsers  current non-anonymous Firebase Auth accounts (stats/users, recounted
 *                    with listUsers when stale). null if the count cannot be determined.
 * CDN-cached 60 seconds so the usage counters stay reasonably live.
 */
import { cors } from '../http.js';
import { pub } from '../firebaseAdmin.js';
import { monthKey, presentTreasury, presentUsage, USAGE_TOTAL_ID, usageDocId } from '../usage.js';
import { getRegisteredUsers } from '../userCount.js';
import { countLibraryStats } from '../library.js';

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
    let stats = presentStats(publicSnap.exists ? publicSnap.data() : null);
    try {
      const live = await countLibraryStats(pub().collection('resources'));
      const library = {
        resources: live.resources,
        approvedResources: live.approvedResources,
        linkHealth: live.linkHealth,
        byExam: live.byExam,
        updatedAt: iso(live.updatedAt)
      };
      stats = stats ? { ...stats, ...library } : { ...library, plansBuilt: 0, cacheHits: 0, cacheHitRate: null, fallbackPlans: 0 };
    } catch (err) {
      console.warn('[stats] live library counts unavailable, using the last rollup:', err?.message);
    }
    const usage = presentUsage(usageSnap.exists ? usageSnap.data() : null, month);
    const usageTotal = presentUsage(totalSnap.exists ? totalSnap.data() : null, null);
    const treasury = presentTreasury(ledgerSnap.exists ? ledgerSnap.data() : null);
    const registeredUsers = await getRegisteredUsers();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return res.status(200).json({ stats, usage, usageTotal, treasury, registeredUsers });
  } catch (err) {
    console.error('[stats]', err);
    return res.status(500).json({ error: 'Could not read the public stats.' });
  }
}
