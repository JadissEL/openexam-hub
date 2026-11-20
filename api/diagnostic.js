// POST /api/diagnostic — thin route for the diagnostic agent (lib/agents/diagnostic.js).
//   {action:'create', exam, level}           -> 12-question self-check (LLM, cached, 3 rotating variants)
//   {action:'score', exam, level, answers[]}  -> deterministic per-skill scores + estimatedLevel
import { cors } from '../lib/http.js';
import { BadInput, readBody } from '../lib/agents/learnerShared.js';
import { createDiagnostic, scoreDiagnostic } from '../lib/agents/diagnostic.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const body = readBody(req);
    if (body.action === 'create') {
      const out = await createDiagnostic(body);
      return res.status(out.status === 'ok' ? 200 : 503).json(out);
    }
    if (body.action === 'score') return res.status(200).json(scoreDiagnostic(body));
    return res.status(400).json({ error: "action must be 'create' or 'score'" });
  } catch (err) {
    if (err instanceof BadInput) return res.status(400).json({ error: err.message });
    console.error('diagnostic', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
