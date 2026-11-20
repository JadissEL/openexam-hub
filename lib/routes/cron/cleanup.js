/**
 * GET /api/cron/cleanup — nightly Vercel cron (Authorization: Bearer CRON_SECRET).
 *
 * Replaces Firestore TTL policies (TTL needs billing, which is off on this project):
 *  1. Expired cache docs under artifacts/{APP_ID}/public/data: every doc in plans, usage_buckets,
 *     calib_buckets and link_checks whose `expireAt` has passed. Shared plans written before
 *     `expireAt` existed fall back to `cachedAt` + CACHE_MAX_AGE_DAYS.
 *  2. Anonymous Firebase Auth users older than ANON_MAX_AGE_DAYS, with their users/{uid} data.
 *     Anonymous sign-in no longer exists in the app (accounts are required), so these are leftovers.
 * Counts are logged and returned. `?dry=1` (or DRY_RUN_DEFAULT below) only counts, deleting nothing.
 */
import { FieldPath } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { requireBearer, sendJson } from '../../auth.js';
import { getDb, pub } from '../../firebaseAdmin.js';
import { deleteUserData } from '../../userData.js';
import { CACHE_MAX_AGE_DAYS } from '../../plans.js';

export const DRY_RUN_DEFAULT = true;
export const ANON_MAX_AGE_DAYS = 7;
export const CACHE_COLLECTIONS = ['plans', 'usage_buckets', 'calib_buckets', 'link_checks'];
const DAY = 864e5;
const BUDGET_MS = 240000;
const PAGE = 300;

const toMs = (v) => {
  if (v == null) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

export function isExpired(coll, data, now) {
  const exp = toMs(data?.expireAt);
  if (exp != null) return exp <= now;
  if (coll === 'plans') {
    const cached = toMs(data?.cachedAt);
    return cached != null && cached + CACHE_MAX_AGE_DAYS * DAY <= now;
  }
  return false;
}

export function isAnonymous(u) {
  return !!u && !u.email && !u.phoneNumber && (!u.providerData || u.providerData.length === 0);
}

async function cleanCollection(db, coll, { now, dryRun, deadline }) {
  const col = pub().collection(coll);
  let scanned = 0;
  let expired = 0;
  let last = null;
  for (;;) {
    if (Date.now() > deadline) return { scanned, expired, partial: true };
    let q = col.select('expireAt', 'cachedAt').orderBy(FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.size;
    const doomed = snap.docs.filter((d) => isExpired(coll, d.data(), now));
    expired += doomed.length;
    if (!dryRun && doomed.length) {
      const batch = db.batch();
      doomed.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return { scanned, expired };
}

async function cleanAnonymous(db, { now, dryRun, deadline, isFresh }) {
  const cutoff = now - ANON_MAX_AGE_DAYS * DAY;
  const out = { scanned: 0, anonymous: 0, matched: 0, deleted: 0, failed: 0 };
  let pageToken;
  const doomed = [];
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      out.scanned++;
      if (!isAnonymous(u)) continue;
      out.anonymous++;
      const created = Date.parse(u.metadata?.creationTime || '');
      if (!Number.isFinite(created) || created > cutoff) continue;
      if (isFresh && isFresh(u)) continue; // test seam only
      out.matched++;
      doomed.push(u.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken && Date.now() < deadline);
  if (dryRun) return out;
  for (let i = 0; i < doomed.length; i += 100) {
    if (Date.now() > deadline) { out.partial = true; break; }
    const chunk = doomed.slice(i, i + 100);
    const ok = [];
    for (const uid of chunk) {
      try {
        await deleteUserData(uid, db);
        ok.push(uid);
      } catch {
        out.failed++;
      }
    }
    if (ok.length) {
      const r = await getAuth().deleteUsers(ok);
      out.deleted += r.successCount;
      out.failed += r.failureCount;
    }
  }
  return out;
}

export async function runCleanup({ dryRun = DRY_RUN_DEFAULT, now = Date.now(), isFresh = null, budgetMs = BUDGET_MS } = {}) {
  const db = getDb();
  const deadline = Date.now() + budgetMs;
  const expiredCache = { total: 0 };
  for (const coll of CACHE_COLLECTIONS) {
    try {
      const r = await cleanCollection(db, coll, { now, dryRun, deadline });
      expiredCache[coll] = r;
      expiredCache.total += r.expired;
    } catch (err) {
      expiredCache[coll] = { error: err?.message || 'failed' };
    }
  }
  let anonymousUsers;
  try {
    anonymousUsers = await cleanAnonymous(db, { now, dryRun, deadline, isFresh });
  } catch (err) {
    anonymousUsers = { error: err?.message || 'failed', matched: 0, deleted: 0 };
  }
  const summary = { dryRun, expiredCache, anonymousUsers };
  console.log(`[cleanup] ${dryRun ? 'DRY RUN (nothing deleted)' : 'deleted'}: ${JSON.stringify(summary)}`);
  return summary;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireBearer(req, res, 'CRON_SECRET')) return;
  try {
    const dry = String(req.query?.dry ?? '') === '1' ? true : DRY_RUN_DEFAULT;
    return sendJson(res, 200, { ok: true, ...(await runCleanup({ dryRun: dry })) });
  } catch (err) {
    console.error('[cleanup] failed', err?.message);
    return sendJson(res, 500, { error: 'cleanup failed' });
  }
}
