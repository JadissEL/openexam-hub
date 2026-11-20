// Everything a learner owns lives under artifacts/{APP_ID}/users/{uid} (profile doc + roadmaps,
// srs, placement and any other sub-collection). Used by account self-deletion (POST /api/account)
// and by the nightly cleanup cron for stale anonymous users.
import { getAuth } from 'firebase-admin/auth';
import { getDb, APP_ID, pub } from './firebaseAdmin.js';

export function userDocRef(db, uid) {
  return db.collection('artifacts').doc(APP_ID).collection('users').doc(uid);
}

/** Recursively deletes the user's Firestore tree (doc + every sub-collection). Safe if nothing exists. */
export async function deleteUserData(uid, db = getDb()) {
  if (typeof uid !== 'string' || !uid || uid.includes('/')) throw new Error('invalid uid');
  await db.recursiveDelete(userDocRef(db, uid));
  // Server-only email bookkeeping (timestamps only, no addresses): signup alert claim + rate limits.
  await Promise.all(['signup_alerts', 'user_emails'].map((c) => pub().collection(c).doc(uid).delete().catch(() => {})));
}

/** Deletes the Firestore data first, then the Firebase Auth user (missing user = already gone). */
export async function deleteAccount(uid, db = getDb()) {
  await deleteUserData(uid, db);
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
}
