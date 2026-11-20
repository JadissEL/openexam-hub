// /api/cron/<job>, one Vercel function for every cron job (Authorization: Bearer CRON_SECRET,
// checked inside each handler). maxDuration 300 comes from vercel.json "api/cron/*.js".
// Add new jobs (e.g. rollup) here plus a "crons" entry in vercel.json, not as new files.
import { createDispatcher } from '../../lib/dispatch.js';
import recheckLinks from '../../lib/routes/cron/recheck-links.js';

export const ROUTES = {
  'recheck-links': recheckLinks // GET /api/cron/recheck-links (daily 03:00 UTC)
};

export default createDispatcher(ROUTES, 'job');
