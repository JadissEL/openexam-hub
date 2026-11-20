// POST /api/webhooks/kofi — Ko-fi payment webhook.
// Body is application/x-www-form-urlencoded with one `data` field holding JSON.
// Verified by comparing data.verification_token to KOFI_VERIFICATION_TOKEN (timing-safe);
// idempotent on data.message_id (Ko-fi retries with the same message_id until it gets a 200).
import { rawBody } from '../../http.js';
import { safeEqual, sendJson } from '../../auth.js';
import { applyLedgerEvent, parseKofiBody, parseKofiPayment } from '../../ledger.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  const expected = process.env.KOFI_VERIFICATION_TOKEN;
  if (!expected) return sendJson(res, 503, { error: 'KOFI_VERIFICATION_TOKEN is not configured' });
  let body;
  try {
    body = await rawBody(req);
  } catch {
    return sendJson(res, 400, { error: 'could not read body' });
  }
  if (body.length > 256 * 1024) return sendJson(res, 400, { error: 'payload too large' });
  const data = parseKofiBody(body);
  if (!data) return sendJson(res, 400, { error: 'expected form field `data` containing JSON' });
  if (!safeEqual(String(data.verification_token || ''), expected)) return sendJson(res, 401, { error: 'invalid verification token' });

  const parsed = parseKofiPayment(data);
  if (parsed.error) return sendJson(res, 400, { error: parsed.error });
  if (parsed.ignore) return sendJson(res, 200, { ok: true, ignored: parsed.ignore });
  try {
    const r = await applyLedgerEvent(parsed);
    return sendJson(res, 200, { ok: true, duplicate: r.duplicate, counted: r.counted, amountEur: r.amountEur, flags: r.flags });
  } catch (err) {
    console.error('kofi ledger error', err?.message);
    return sendJson(res, 500, { error: 'ledger write failed' }); // Ko-fi retries non-200s
  }
}
