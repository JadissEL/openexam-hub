/**
 * Registered (non-anonymous) Firebase Auth user count for the public stats API.
 *
 * Cheap path: reuse stats/users when it is fresh. Otherwise listUsers() (deleted
 * accounts are already absent) and write the total back. Anonymous leftover
 * accounts are excluded with the same rule as the nightly cleanup.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { pub } from './firebaseAdmin.js';

export const USERS_DOC_ID = 'users';
/** Reuse a stored count for this long; /api/stats itself is CDN-cached for 60s. */
export const USER_COUNT_MAX_AGE_MS = 5 * 60 * 1000;

let countImpl = defaultCountRegisteredUsers;
/** Test seam. Pass null to restore. */
export function setCountRegisteredUsersForTests(fn) {
  countImpl = fn || defaultCountRegisteredUsers;
}

/** Same rule as lib/routes/cron/cleanup.js isAnonymous. */
export function isAnonymousUser(u) {
  return !!u && !u.email && !u.phoneNumber && (!u.providerData || u.providerData.length === 0);
}

export async function listRegisteredUserCount(listPage) {
  const list = listPage || ((max, token) => getAuth().listUsers(max, token));
  let n = 0;
  let pageToken;
  do {
    const page = await list(1000, pageToken);
    const users = page?.users || [];
    for (const u of users) {
      if (!isAnonymousUser(u)) n += 1;
    }
    pageToken = page?.pageToken;
  } while (pageToken);
  return n;
}

async function defaultCountRegisteredUsers() {
  return listRegisteredUserCount();
}

function ageMs(updatedAt, now) {
  if (!updatedAt) return Infinity;
  const ms = updatedAt?.toDate
    ? updatedAt.toDate().getTime()
    : updatedAt instanceof Date
      ? updatedAt.getTime()
      : typeof updatedAt === 'string' || typeof updatedAt === 'number'
        ? new Date(updatedAt).getTime()
        : NaN;
  if (!Number.isFinite(ms)) return Infinity;
  return now - ms;
}

/**
 * Public aggregate: a non-negative integer, or null if it cannot be determined.
 * Reads stats/users when fresh; otherwise recounts and stores the result.
 */
export async function getRegisteredUsers({ now = Date.now() } = {}) {
  try {
    const ref = pub().collection('stats').doc(USERS_DOC_ID);
    let cached = null;
    try {
      const snap = await ref.get();
      if (snap.exists) cached = snap.data() || null;
    } catch {
      cached = null;
    }
    const cachedCount = cached && Number.isFinite(Number(cached.registeredUsers)) ? Number(cached.registeredUsers) : null;
    if (cachedCount != null && cachedCount >= 0 && ageMs(cached.updatedAt, now) < USER_COUNT_MAX_AGE_MS) {
      return cachedCount;
    }
    let counted;
    try {
      counted = await countImpl();
    } catch {
      return cachedCount;
    }
    if (counted == null || !Number.isFinite(Number(counted)) || Number(counted) < 0) {
      return cachedCount;
    }
    const n = Math.floor(Number(counted));
    try {
      await ref.set({ registeredUsers: n, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch {
      /* a failed write must not hide a good count */
    }
    return n;
  } catch {
    return null;
  }
}
