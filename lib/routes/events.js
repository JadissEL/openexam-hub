/**
 * POST /api/events {type:'task_done', planKey, resourceId} -> 202 {ok:true}
 *
 * Records that a learner finished a task that uses a library resource. The count feeds the
 * resource's completion rate (Bayesian quality score in lib/algo/rank.js) through ONE
 * usage-bucket field increment, folded nightly by the rollup cron — never a hot doc write.
 * Guards: the resource must be part of the named shared plan (plans/{planKey}.resourceIds), and
 * each IP may send at most RATE_LIMIT events per hour per warm instance.
 */
import { cors } from '../http.js';
import { safeEqual } from '../auth.js';
import { pub } from '../firebaseAdmin.js';
import { recordUsage } from '../counters.js';
import { createLru } from '../algo/lru.js';

export const RATE_LIMIT = 120;
const PLAN_KEY_RE = /^[A-Z][A-Z0-9_-]{1,19}_(A1|A2|B1|B2|C1|C2)_\d{1,3}(_[wms-]{6})?$/;
const RID_RE = /^[a-f0-9]{24}$/;
const hits = createLru({ max: 5000, ttlMs: 3600000 });
const plans = createLru({ max: 300, ttlMs: 600000 });

// Behind the Cloudflare Worker (worker/index.js), Vercel sees the Worker's IP in x-forwarded-for, so the
// Worker passes the visitor IP in x-oeh-client-ip; it is trusted only with the PROXY_SHARED_SECRET key.
const proxiedIp = (req) => {
  const key = process.env.PROXY_SHARED_SECRET;
  const h = req.headers || {};
  return key && typeof h['x-oeh-proxy-key'] === 'string' && safeEqual(h['x-oeh-proxy-key'], key) ? h['x-oeh-client-ip'] : null;
};
const clientIp = (req) => String(proxiedIp(req) || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 64);

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  return null;
}

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error: 'Use POST.' });
    }
    let body;
    try { body = await readBody(req); } catch { body = null; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Body must be a JSON object.' });
    const { type, planKey, resourceId } = body;
    if (type !== 'task_done') return res.status(400).json({ error: '"type" must be "task_done".' });
    if (typeof planKey !== 'string' || !PLAN_KEY_RE.test(planKey)) return res.status(400).json({ error: '"planKey" is invalid.' });
    if (typeof resourceId !== 'string' || !RID_RE.test(resourceId)) return res.status(400).json({ error: '"resourceId" must be a 24-char library id.' });

    const ip = clientIp(req);
    const n = (hits.get(ip) || 0) + 1;
    hits.set(ip, n);
    if (n > RATE_LIMIT) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({ error: 'Too many events; try again later.' });
    }
    let ids = plans.get(planKey);
    if (!ids) {
      const snap = await pub().collection('plans').doc(planKey).get();
      ids = snap.exists && Array.isArray(snap.data().resourceIds) ? snap.data().resourceIds : [];
      plans.set(planKey, ids);
    }
    if (!ids.includes(resourceId)) return res.status(404).json({ error: 'That resource is not part of this plan.' });
    await recordUsage([resourceId], 'c');
    return res.status(202).json({ ok: true });
  } catch (err) {
    console.error('[events]', err);
    return res.status(500).json({ error: 'Could not record the event.' });
  }
}
