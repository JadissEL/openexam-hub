// Light public routes under /api/<route>, one Vercel function (Hobby plan: max 12 per deployment).
// Static files in api/ (generate-roadmap, diagnostic, coach, practice) win over this dynamic file,
// so only names listed here reach it; anything else gets a JSON 404.
// Add new light endpoints (e.g. plan, stats, events, shelf, item-set) to this table instead of
// creating new files in api/. Handlers live in lib/routes/.
import { createDispatcher } from '../lib/dispatch.js';
import checkLink from '../lib/routes/check-link.js';
import library from '../lib/routes/library.js';
import plan from '../lib/routes/plan.js';
import stats from '../lib/routes/stats.js';
import events from '../lib/routes/events.js';
import adsTxt from '../lib/routes/ads-txt.js';
import account from '../lib/routes/account.js';

export const ROUTES = {
  'check-link': checkLink, // GET /api/check-link?url=
  library, // GET /api/library?exam=&level=&skill=  (served from the ranked shelf)
  plan, // GET /api/plan?exam=&level=&days=&profile=  (CDN-cached shared plan, 404 on miss)
  stats, // GET /api/stats  (stats/public)
  events, // POST /api/events {type:'task_done', planKey, resourceId}
  'ads-txt': adsTxt, // GET /ads.txt -> /api/ads-txt (404 until ADSENSE_PUBLISHER_ID is set)
  account // POST /api/account {action:'delete', confirm:'DELETE'} with a Firebase ID token: delete own data + account
};

export default createDispatcher(ROUTES, 'route');
