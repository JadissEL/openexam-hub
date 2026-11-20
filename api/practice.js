// POST /api/practice — thin route for the practice generator (lib/agents/practice.js).
//   {exam, level, skill, count<=10} -> {items, disclaimer, source}; 503 if nothing cached and the LLM is down.
import { cors } from '../lib/http.js';
import { BadInput, readBody } from '../lib/agents/learnerShared.js';
import { generatePractice } from '../lib/agents/practice.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const out = await generatePractice(readBody(req));
    return res.status(out.status === 'ok' ? 200 : 503).json(out);
  } catch (err) {
    if (err instanceof BadInput) return res.status(400).json({ error: err.message });
    console.error('practice', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
