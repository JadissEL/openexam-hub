// /api/admin/<action>, one Vercel function for every admin route (Authorization: Bearer ADMIN_SECRET,
// checked inside each handler). maxDuration 300 comes from vercel.json "api/admin/*.js" (needed by expand).
import { createDispatcher } from '../../lib/dispatch.js';
import expand from '../../lib/routes/admin/expand.js';
import approve from '../../lib/routes/admin/approve.js';
import reviewProfile from '../../lib/routes/admin/review-profile.js';

export const ROUTES = {
  expand, // POST /api/admin/expand
  approve, // POST /api/admin/approve
  'review-profile': reviewProfile // POST /api/admin/review-profile
};

export default createDispatcher(ROUTES, 'action');
