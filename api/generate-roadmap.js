/**
 * POST /api/generate-roadmap
 * Body: {exam, level, days, forceRefresh?, diagnostic?:{skillScores}} -> {roadmap}
 * Auth: Bearer Firebase ID token of a non-anonymous user (401 otherwise).
 * 400 bad input, 401 unsigned/anonymous, 405 wrong method, 422 not enough verified resources, 500 generic (no stack).
 */
import { cors, safeBody } from '../lib/http.js';
import { requireAccount } from '../lib/auth.js';
import { generateRoadmap } from '../lib/orchestrator.js';

// Hobby with fluid compute allows 300s and that is also the plan maximum
// (https://vercel.com/docs/functions/limitations). A polish chain is 30s + 30s + 55s
// of provider timeouts (30s more per extra fallback model), and this route may also
// extract an exam format and re-check links before that. 300s is the platform cap.
// generateRoadmap stops new LLM calls 25s early so the deterministic plan still returns.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error: 'Use POST.' });
    }
    if (!(await requireAccount(req, res))) return;
    const parsed = safeBody(req);
    if (!parsed.ok) return res.status(400).json({ error: 'Body must be valid JSON.' });
    let body = parsed.body;
    if (typeof body === 'string') {
      if (body.length > 20000) return res.status(400).json({ error: 'Request body too large.' });
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body must be valid JSON.' }); }
    }
    const { status, body: out } = await generateRoadmap(body);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json(out);
  } catch (err) {
    console.error('[generate-roadmap]', err);
    return res.status(500).json({ error: 'Roadmap generation failed unexpectedly. Please try again.' });
  }
}
