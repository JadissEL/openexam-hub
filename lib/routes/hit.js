/**
 * POST /api/hit — stores one cookieless visit-counter record (lib/analytics/hits.js).
 *
 * Only the Cloudflare Worker may call this: it filters bots, strips the beacon down to
 * {t, p, r, u, a} / {t, e, a} and signs the call with PROXY_SHARED_SECRET. Nothing identifying is
 * stored: one Firestore increment on the day's aggregate doc analytics_daily/{YYYY-MM-DD} (Athens
 * day), outside the public data tree, so clients can never read it (default-deny rules).
 */
import { FieldValue } from 'firebase-admin/firestore';
import { safeEqual, sendJson, readJsonBody } from '../auth.js';
import { getDb } from '../firebaseAdmin.js';
import { athensDay, incrementsFor, validRecord } from '../analytics/hits.js';

export const ANALYTICS_COLLECTION = 'analytics_daily';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Use POST.' });
    }
    const key = process.env.PROXY_SHARED_SECRET;
    const h = req.headers || {};
    if (!key || typeof h['x-oeh-proxy-key'] !== 'string' || !safeEqual(h['x-oeh-proxy-key'], key)) {
      return sendJson(res, 403, { error: 'forbidden' });
    }
    const body = await readJsonBody(req, 2048);
    const rec = validRecord(body);
    if (!rec) return sendJson(res, 400, { error: 'bad record' });
    const day = athensDay();
    await getDb()
      .collection(ANALYTICS_COLLECTION)
      .doc(day)
      .set({ day, updatedAt: FieldValue.serverTimestamp(), ...incrementsFor(rec, (n) => FieldValue.increment(n)) }, { merge: true });
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  } catch (err) {
    console.error('[hit]', err?.message);
    return sendJson(res, 500, { error: 'could not record' });
  }
}
