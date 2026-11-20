// POST /api/coach — thin route for the progress coach (lib/agents/coach.js).
//   {roadmap, daysElapsed} -> {onTrack, expectedPct, actualPct, summary, rebalancedPhases, tips, source}
// Never fails on LLM outage: the agent falls back to a deterministic even spread.
import { cors } from '../lib/http.js';
import { requireAccount } from '../lib/auth.js';
import { BadInput, readBody } from '../lib/agents/learnerShared.js';
import { coachProgress } from '../lib/agents/coach.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!(await requireAccount(req, res))) return;
  try {
    return res.status(200).json(await coachProgress(readBody(req)));
  } catch (err) {
    if (err instanceof BadInput) return res.status(400).json({ error: err.message });
    console.error('coach', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
