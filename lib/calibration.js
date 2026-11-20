/**
 * Item calibration buckets (ARCHITECTURE.md §B.5): POST /api/diagnostic score writes ONE doc,
 * calib_buckets/{shard}_{EXAM}_{LEVEL} = {items: {[itemKey]: {n: inc(1), err: inc(correct − p)}}}.
 * The nightly rollup applies b ← b − K(n)·err per item (the batched form of placement.eloUpdate)
 * and writes item_sets/{EXAM}_{LEVEL}.b. Best effort; never throws.
 * @module lib/calibration
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getPub } from './store.js';

export const CALIB_SHARDS = 10;

export async function recordCalibration(exam, level, items) {
  try {
    if (!/^[A-Z][A-Z0-9_-]{1,19}$/.test(exam) || !/^(A1|A2|B1|B2|C1|C2)$/.test(level)) return;
    const data = { exam, level, expireAt: new Date(Date.now() + 14 * 864e5), items: {} };
    for (const [k, v] of Object.entries(items || {})) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(k) || !Number.isFinite(v.err)) continue;
      data.items[k] = { n: FieldValue.increment(1), err: FieldValue.increment(Math.round(v.err * 1e4) / 1e4) };
    }
    if (!Object.keys(data.items).length) return;
    const shard = Math.floor(Math.random() * CALIB_SHARDS); // load spreading only
    await (await getPub()).collection('calib_buckets').doc(`${shard}_${exam}_${level}`).set(data, { merge: true });
  } catch {
    /* calibration is optional */
  }
}
