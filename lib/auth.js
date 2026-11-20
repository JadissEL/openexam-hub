// Shared secret / auth helpers for webhook, cron and admin routes.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { rawBody } from './http.js';

/**
 * Constant-time string comparison. Both sides are hashed first so inputs of different
 * lengths never short-circuit (timingSafeEqual itself throws on length mismatch).
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** GitHub-style "sha256=<hex>" HMAC of the raw body, checked in constant time. */
export function verifyHmacSha256(rawBody, secret, header) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return safeEqual(expected, header.trim());
}

export function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Checks `Authorization: Bearer <process.env[envName]>`. Sends the error response itself and
 * returns false when the request must stop.
 */
export function requireBearer(req, res, envName) {
  const secret = process.env[envName];
  if (!secret) {
    sendJson(res, 503, { error: `${envName} is not configured on the server` });
    return false;
  }
  const h = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m || !safeEqual(m[1].trim(), secret)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return false;
  }
  return true;
}

/** Parse a JSON body whether or not Vercel's body parser already ran. Returns null on bad JSON. */
export async function readJsonBody(req, limitBytes = 64 * 1024) {
  let parsed;
  try {
    parsed = req.body; // Vercel parses lazily and throws ApiError(400) on malformed JSON
  } catch {
    return null;
  }
  if (parsed !== undefined && parsed !== null && typeof parsed === 'object' && !Buffer.isBuffer(parsed)) return parsed;
  let text = typeof parsed === 'string' ? parsed : Buffer.isBuffer(parsed) ? parsed.toString('utf8') : null;
  if (text === null) {
    // Stream not parsed (unknown content type): read it via data/end events (see lib/http.js rawBody).
    const buf = await rawBody(req);
    if (buf.length > limitBytes) return null;
    text = buf.toString('utf8');
  }
  if (text.length > limitBytes) return null;
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
