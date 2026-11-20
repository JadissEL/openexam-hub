// Client runtime config. The Firebase *web* config is public by design (it identifies the
// project; access is enforced by firestore.rules and Auth settings), so the defaults below
// are safe to commit. Override any value with a VITE_* env var at build time.
const env = import.meta.env || {};
const pick = (key, fallback) => (env[key] !== undefined && env[key] !== '' ? env[key] : fallback);

export const firebaseConfig = {
  apiKey: pick('VITE_FIREBASE_API_KEY', 'AIzaSyDqyWI3ufXjig_ucmm_59BstzJZTgnVzf8'),
  authDomain: pick('VITE_FIREBASE_AUTH_DOMAIN', 'openexam-hub.firebaseapp.com'),
  projectId: pick('VITE_FIREBASE_PROJECT_ID', 'openexam-hub'),
  storageBucket: pick('VITE_FIREBASE_STORAGE_BUCKET', 'openexam-hub.firebasestorage.app'),
  messagingSenderId: pick('VITE_FIREBASE_MESSAGING_SENDER_ID', '168221764927'),
  appId: pick('VITE_FIREBASE_APP_ID', '1:168221764927:web:7a9ec291f691ffa79af78a')
};

/** Namespace for all Firestore data: artifacts/{APP_ID}/... Must equal the server's APP_ID. */
export const APP_ID = pick('VITE_APP_ID', 'openexam-hub');

/** Base URL of the API. '' = same origin (/api/* served by the Vercel functions in this repo). */
export const API_BASE = String(pick('VITE_API_BASE', '')).replace(/\/+$/, '');

/** Set VITE_SERVER_ENABLED=false to run the UI without the API (preview mode). */
export const SERVER_ENABLED = String(pick('VITE_SERVER_ENABLED', 'true')).toLowerCase() !== 'false';
