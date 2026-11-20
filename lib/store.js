// Lazy Firestore access for the ledger / maintenance / admin modules, with a test seam.
// lib/firebaseAdmin.js initialises firebase-admin at import time, so it is imported only on
// first use; tests call setStoreForTests({ db, pub }) with an in-memory fake instead.
let override = null;
let real = null;

export function setStoreForTests(fake) {
  override = fake; // { db, pub } or null to restore the real one
}

async function load() {
  if (override) return override;
  if (!real) {
    const m = await import('./firebaseAdmin.js');
    real = { db: m.getDb(), pub: m.pub }; // throws ConfigError when FIREBASE_SERVICE_ACCOUNT is missing
  }
  return real;
}

/** Firestore instance (needed for runTransaction). */
export async function getDb() {
  return (await load()).db;
}

/** artifacts/{APP_ID}/public/data document reference. */
export async function getPub() {
  return (await load()).pub();
}
