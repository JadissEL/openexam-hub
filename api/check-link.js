/**
 * GET /api/check-link?url=<https url> -> {url, status, httpCode, finalUrl}
 * Real HTTP check via lib/linkCheck.js; only allowlisted hosts are ever requested
 * (others return status 'off_allowlist' without any network call). CDN-cached for 24 h.
 */
import { cors } from '../lib/http.js';
import { checkLink } from '../lib/linkCheck.js';

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'Use GET.' });
    }
    const url = typeof req.query?.url === 'string' ? req.query.url.trim() : '';
    if (!url || url.length > 2048) return res.status(400).json({ error: '"url" query parameter is required (max 2048 characters).' });
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
    } catch {
      return res.status(400).json({ error: '"url" must be an absolute http(s) URL.' });
    }
    const r = await checkLink(url);
    // Errors/timeouts are transient: cache them briefly so a blip isn't pinned for a day.
    res.setHeader('Cache-Control', r.status === 'error' ? 'public, s-maxage=300' : 'public, s-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json({ url, status: r.status, httpCode: r.httpCode ?? null, finalUrl: r.finalUrl ?? url });
  } catch (err) {
    console.error('[check-link]', err);
    return res.status(500).json({ error: 'Link check failed unexpectedly.' });
  }
}
