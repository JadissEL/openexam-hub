import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// FIREBASE_SERVICE_ACCOUNT = the service-account JSON (as one string). APP_ID must match VITE_APP_ID in the client (both default to 'openexam-hub').
// Initialised lazily so a missing/bad credential surfaces as a clean error inside the handler, not a crash at import.
export class ConfigError extends Error {}

let _db = null;
export function getDb() {
  if (_db) return _db;
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw && process.env.FIRESTORE_EMULATOR_HOST) {
      // Local/e2e only: the emulator needs no credentials, just a project id.
      initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-openexam' });
      _db = getFirestore();
      return _db;
    }
    if (!raw) throw new ConfigError('Server is not configured: FIREBASE_SERVICE_ACCOUNT is missing.');
    let creds;
    try {
      creds = JSON.parse(raw);
    } catch {
      throw new ConfigError('Server is not configured: FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
    }
    initializeApp({ credential: cert(creds) });
  }
  _db = getFirestore();
  return _db;
}

// Back-compat: `db` behaves like the Firestore instance but only initialises on first use.
export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      const real = getDb();
      const v = real[prop];
      return typeof v === 'function' ? v.bind(real) : v;
    }
  }
);
export const APP_ID = process.env.APP_ID || 'openexam-hub';
export const pub = () => getDb().collection('artifacts').doc(APP_ID).collection('public').doc('data');
