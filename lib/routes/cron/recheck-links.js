// GET /api/cron/recheck-links — Vercel cron (Authorization: Bearer CRON_SECRET).
// Re-checks the 150 least recently checked library links, then makes sure the donation
// ledger has rolled into the current month even if no donation arrived yet.
import { requireBearer, sendJson } from '../../auth.js';
import { recheckLinks } from '../../agents/linkMaintenance.js';
import { ensureCurrentMonth } from '../../ledger.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireBearer(req, res, 'CRON_SECRET')) return;
  try {
    const summary = await recheckLinks();
    let ledger = null;
    try {
      ledger = await ensureCurrentMonth();
    } catch (err) {
      console.error('[recheck-links] ledger rollover failed', { message: err?.message || String(err), code: err?.code });
      ledger = { error: 'Could not roll the funding month' };
    }
    return sendJson(res, 200, { ok: true, summary, ledger });
  } catch (err) {
    console.error('recheck-links failed', err?.message);
    return sendJson(res, 500, { error: 'link maintenance failed' });
  }
}
