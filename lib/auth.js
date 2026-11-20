// Shared secret / auth helpers for webhook, cron and admin routes.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { rawBody } from './http.js';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from './firebaseAdmin.js';

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

/**
 * Require a signed-in, non-anonymous Firebase user.
 * Used by POST /api/generate-roadmap, /api/diagnostic, /api/practice and
 * /api/coach so the AI token budget cannot be reused without an account.
 *
 * In the local Firestore emulator (FIRESTORE_EMULATOR_HOST set), a matching
 * E2E_GENERATE_TOKEN may be sent as `Authorization: Bearer <token>` so the
 * end-to-end suite can call the route without standing up the Auth emulator.
 * That bypass is ignored when the Firestore emulator host is not set.
 *
 * Sends the 401 response itself and returns null when the request must stop.
 * On success, returns the decoded token (or a small e2e stub).
 */
export async function requireAccount(req, res) {
  const header = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const token = m ? m[1].trim() : '';

  const e2e = process.env.E2E_GENERATE_TOKEN;
  if (process.env.FIRESTORE_EMULATOR_HOST && e2e && token && safeEqual(token, e2e)) {
    return { uid: 'e2e-learner', email: 'e2e@demo.local', e2e: true };
  }

  if (!token) {
    sendJson(res, 401, { error: 'A free account is required to use this.' });
    return null;
  }

  try {
    getDb(); // ensure the Firebase Admin app is initialised
    const decoded = await getAuth().verifyIdToken(token);
    if (decoded?.firebase?.sign_in_provider === 'anonymous') {
      sendJson(res, 401, { error: 'A free account is required to use this.' });
      return null;
    }
    return decoded;
  } catch {
    sendJson(res, 401, { error: 'A free account is required to use this.' });
    return null;
  }
}
