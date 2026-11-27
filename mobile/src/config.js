import { firebaseConfig, APP_ID, API_BASE as configured } from '@hub/src/firebaseConfig.js';

export { firebaseConfig, APP_ID };

/** The website's API. Empty VITE_API_BASE means "same origin" on the web; the app always calls the live host. */
export const API_BASE = configured || 'https://openexamhub.org';
export const SITE = 'https://openexamhub.org';
export const PRIVACY_URL = `${SITE}/privacy`;
export const FUNDING_URL = `${SITE}/funding`;

/** Same public Clarity project as the website (vite.config.js). Override with CLARITY_PROJECT_ID at build time on Android. */
export const CLARITY_PROJECT_ID = 'zk5viik44t';
