// POST /api/webhooks/open-collective?token=<OPEN_COLLECTIVE_WEBHOOK_TOKEN>
// Open Collective's generic webhooks carry NO signature or secret header (checked against
// opencollective-api server/lib/notifications: a plain axios.post of the activity JSON).
// So: (1) the URL carries a long random token compared in constant time, and
// (2) the payload is only a hint — the transaction is re-read by id from the public GraphQL
// API (api.opencollective.com/graphql/v2) and only the API's amount/account/kind is counted.
// Subscribe the webhook to the "New transaction" activity (collective.transaction.created).
import { rawBody } from '../../http.js';
import { safeEqual, sendJson } from '../../auth.js';
import { applyLedgerEvent, confirmOpenCollectiveTransaction } from '../../ledger.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  const expected = process.env.OPEN_COLLECTIVE_WEBHOOK_TOKEN;
  if (!expected) return sendJson(res, 503, { error: 'OPEN_COLLECTIVE_WEBHOOK_TOKEN is not configured' });
  let token = '';
  try {
    token = new URL(req.url, 'http://local').searchParams.get('token') || '';
  } catch {
    /* fall through to 401 */
  }
  if (!safeEqual(token, expected)) return sendJson(res, 401, { error: 'invalid token' });

  let payload;
  try {
    const body = await rawBody(req);
    if (body.length > 512 * 1024) return sendJson(res, 400, { error: 'payload too large' });
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return sendJson(res, 400, { error: 'invalid JSON payload' });
  }
  const confirmed = await confirmOpenCollectiveTransaction(payload);
  if (confirmed.error) return sendJson(res, confirmed.status || 400, { error: confirmed.error });
  if (confirmed.ignore) return sendJson(res, 200, { ok: true, ignored: confirmed.ignore });
  try {
    const r = await applyLedgerEvent(confirmed);
    return sendJson(res, 200, { ok: true, duplicate: r.duplicate, counted: r.counted, amountEur: r.amountEur, flags: r.flags });
  } catch (err) {
    console.error('open-collective ledger error', err?.message);
    return sendJson(res, 500, { error: 'ledger write failed' });
  }
}
