// POST /api/admin/expand {exam, levels[]} — Authorization: Bearer ADMIN_SECRET.
// Drafts candidate official resources for a new exam; saves passing ones with approved:false.
import { readJsonBody, requireBearer, sendJson } from '../../auth.js';
import { ConfigError } from '../../firebaseAdmin.js';
import { expandExam, ExpansionInputError, validateExpandInput } from '../../agents/expansion.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireBearer(req, res, 'ADMIN_SECRET')) return;
  const body = await readJsonBody(req);
  if (!body) return sendJson(res, 400, { error: 'body must be a JSON object' });
  let input;
  try {
    input = validateExpandInput(body);
  } catch (err) {
    if (err instanceof ExpansionInputError) return sendJson(res, 400, { error: err.message });
    throw err;
  }
  try {
    const result = await expandExam(input);
    return sendJson(res, result.status === 'ok' ? 200 : 502, result);
  } catch (err) {
    if (err instanceof ConfigError) return sendJson(res, 503, { error: err.message });
    console.error('expand failed', err?.message);
    return sendJson(res, 500, { error: 'expansion failed' });
  }
}
