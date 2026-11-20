/**
 * GET /api/stats -> {stats} — precomputed public numbers (stats/public, written by the nightly
 * rollup cron). One doc read, CDN-cached 5 minutes. `stats` is null until the first rollup.
 */
import { cors } from '../http.js';
import { pub } from '../firebaseAdmin.js';

const iso = (t) => (t?.toDate ? t.toDate().toISOString() : t instanceof Date ? t.toISOString() : typeof t === 'string' ? t : null);

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'Use GET.' });
    }
    const snap = await pub().collection('stats').doc('public').get();
    const d = snap.exists ? snap.data() : null;
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ stats: d ? { ...d, updatedAt: iso(d.updatedAt) } : null });
  } catch (err) {
    console.error('[stats]', err);
    return res.status(500).json({ error: 'Could not read the public stats.' });
  }
}
