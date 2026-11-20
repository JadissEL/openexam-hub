// Light public routes under /api/<route>, one Vercel function (Hobby plan: max 12 per deployment).
// Static files in api/ (generate-roadmap, diagnostic, coach, practice) win over this dynamic file,
// so only names listed here reach it; anything else gets a JSON 404.
// Add new light endpoints (e.g. plan, stats, events, shelf, item-set) to this table instead of
// creating new files in api/. Handlers live in lib/routes/.
import { createDispatcher } from '../lib/dispatch.js';
import checkLink from '../lib/routes/check-link.js';
import library from '../lib/routes/library.js';

export const ROUTES = {
  'check-link': checkLink, // GET /api/check-link?url=
  library // GET /api/library?exam=&level=&skill=
};

export default createDispatcher(ROUTES, 'route');
