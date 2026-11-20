// /api/cron/<job>, one Vercel function for every cron job (Authorization: Bearer CRON_SECRET,
// checked inside each handler). maxDuration 300 comes from vercel.json "api/cron/*.js".
// Add new jobs (e.g. rollup) here plus a "crons" entry in vercel.json, not as new files.
import { createDispatcher } from '../../lib/dispatch.js';
import recheckLinks from '../../lib/routes/cron/recheck-links.js';
import rollup from '../../lib/routes/cron/rollup.js';
import cleanup from '../../lib/routes/cron/cleanup.js';

export const ROUTES = {
  'recheck-links': recheckLinks, // GET /api/cron/recheck-links (daily 03:00 UTC)
  rollup, // GET /api/cron/rollup (daily 03:30 UTC): usage/calibration folds, stats/public, shelves
  cleanup // GET /api/cron/cleanup (daily 04:15 UTC): expired cache docs + stale anonymous users (replaces Firestore TTL)
};

export default createDispatcher(ROUTES, 'job');
