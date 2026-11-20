/**
 * Hot counters without hot documents (ARCHITECTURE.md §B.5).
 *
 * Firestore sustains about 1 sustained write/s per document, so request-path counters never touch a
 * shared doc directly:
 *   - bump({cacheHits: 1, plannerTokens: 812}) -> counters/{name}/shards/{0..9}  {n: increment}
 *   - recordUsage([rid…], 'u'|'c')             -> usage_buckets/{shard}_{yyyymmddhh} {u|c: {rid: increment}}
 * The nightly rollup cron (lib/routes/cron/rollup.js) folds shards and buckets into resources,
 * stats/public and shelves. Both helpers are best effort and never throw.
 * @module lib/counters
 */
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';

export const SHARDS = 10;
// Randomness is fine here: it only spreads load across shards, it never decides anything.
const shard = () => Math.floor(Math.random() * SHARDS);
export const hourKey = (d = new Date()) => d.toISOString().slice(0, 13).replace(/[-T]/g, '');
const ttl = (days) => new Date(Date.now() + days * 864e5);
const NAME_RE = /^[A-Za-z0-9_:.-]{1,64}$/;
const RID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Increment named counters (one shard write each). */
export async function bump(fields) {
  try {
    const writes = [];
    for (const [name, v] of Object.entries(fields || {})) {
      if (!v || !Number.isFinite(v) || !NAME_RE.test(name)) continue;
      writes.push(pub().collection('counters').doc(name).collection('shards').doc(String(shard())).set({ n: FieldValue.increment(v) }, { merge: true }));
    }
    await Promise.all(writes);
  } catch {
    /* counters never break a request */
  }
}

/** One write for any number of resource ids. kind 'u' = used in a plan, 'c' = task completed. */
export async function recordUsage(resourceIds, kind = 'u') {
  try {
    const ids = [...new Set((resourceIds || []).filter((id) => typeof id === 'string' && RID_RE.test(id)))];
    if (!ids.length || (kind !== 'u' && kind !== 'c')) return;
    const data = { expireAt: ttl(14), [kind]: Object.fromEntries(ids.map((id) => [id, FieldValue.increment(1)])) };
    await pub().collection('usage_buckets').doc(`${shard()}_${hourKey()}`).set(data, { merge: true });
  } catch {
    /* best effort */
  }
}
