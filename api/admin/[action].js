// /api/admin/<action>, one Vercel function for every admin route (Authorization: Bearer ADMIN_SECRET,
// checked inside each handler). maxDuration 300 comes from vercel.json "api/admin/*.js" (needed by expand).
import { createDispatcher } from '../../lib/dispatch.js';
import expand from '../../lib/routes/admin/expand.js';
import approve from '../../lib/routes/admin/approve.js';
import reviewProfile from '../../lib/routes/admin/review-profile.js';
import analytics from '../../lib/routes/admin/analytics.js';
import importResources from '../../lib/routes/admin/import-resources.js';

export const ROUTES = {
  expand, // POST /api/admin/expand
  approve, // POST /api/admin/approve
  'review-profile': reviewProfile, // POST /api/admin/review-profile
  'import-resources': importResources, // POST /api/admin/import-resources {items[], dryRun?} (ADMIN_SECRET or OEH_OPS_SECRET)
  analytics // GET /api/admin/analytics?days=14[&format=text] (ADMIN_SECRET or OEH_OPS_SECRET)
};

export default createDispatcher(ROUTES, 'action');
