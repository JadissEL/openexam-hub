// POST /api/webhooks/github-sponsors — GitHub Sponsors `sponsorship` webhook.
// Verified with X-Hub-Signature-256 (HMAC-SHA256 of the raw body, GITHUB_SPONSORS_WEBHOOK_SECRET),
// idempotent on X-GitHub-Delivery. Register with content type application/json.
import { rawBody } from '../../lib/http.js';
import { sendJson, verifyHmacSha256 } from '../../lib/auth.js';
import { applyLedgerEvent, parseGithubSponsorship } from '../../lib/ledger.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  const secret = process.env.GITHUB_SPONSORS_WEBHOOK_SECRET;
  if (!secret) return sendJson(res, 503, { error: 'GITHUB_SPONSORS_WEBHOOK_SECRET is not configured' });
  let body;
  try {
    body = await rawBody(req);
  } catch {
    return sendJson(res, 400, { error: 'could not read body' });
  }
  if (body.length > 1024 * 1024) return sendJson(res, 400, { error: 'payload too large' });
  if (!verifyHmacSha256(body, secret, req.headers['x-hub-signature-256'])) return sendJson(res, 401, { error: 'invalid signature' });

  const event = req.headers['x-github-event'];
  const delivery = req.headers['x-github-delivery'];
  if (event === 'ping') return sendJson(res, 200, { ok: true, pong: true });
  if (event !== 'sponsorship') return sendJson(res, 200, { ok: true, ignored: `event ${event} is not handled` });
  if (typeof delivery !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(delivery)) return sendJson(res, 400, { error: 'missing or invalid X-GitHub-Delivery' });

  let payload;
  try {
    // GitHub can also send application/x-www-form-urlencoded (payload=<json>); support both.
    const text = body.toString('utf8');
    payload = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')
      ? JSON.parse(new URLSearchParams(text).get('payload') || '')
      : JSON.parse(text);
  } catch {
    return sendJson(res, 400, { error: 'invalid JSON payload' });
  }
  const parsed = parseGithubSponsorship(payload);
  if (parsed.error) return sendJson(res, 400, { error: parsed.error });
  if (parsed.ignore) return sendJson(res, 200, { ok: true, ignored: parsed.ignore });
  try {
    const r = await applyLedgerEvent({ ...parsed, eventId: delivery });
    return sendJson(res, 200, { ok: true, duplicate: r.duplicate, counted: r.counted, amountEur: r.amountEur, flags: r.flags });
  } catch (err) {
    console.error('github-sponsors ledger error', err?.message);
    return sendJson(res, 500, { error: 'ledger write failed' }); // non-2xx so the delivery can be redelivered
  }
}
