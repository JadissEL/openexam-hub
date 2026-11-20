// Route dispatcher for Vercel dynamic functions (api/[route].js, api/admin/[action].js, ...).
//
// Why: the Hobby plan allows at most 12 Serverless Functions per deployment, and Vercel counts
// every file under api/ as one. Several routes therefore share one function file that picks the
// handler from the dynamic path segment, so PUBLIC URLs stay exactly the same
// (/api/admin/expand, /api/webhooks/kofi, ...). The route handlers themselves live in lib/routes/
// and are unchanged; lib/ is not scanned for functions.
//
// Raw bodies: Vercel's Node helpers parse req.body lazily (only when accessed), and nothing here
// touches req.body, so webhook handlers can still read the untouched raw stream via lib/http.js
// rawBody() for signature checks.
import { sendJson } from './auth.js';

/** The dynamic segment: Vercel puts it in req.query[param]; fall back to the last path segment. */
export function routeName(req, param) {
  let name = req.query && req.query[param];
  if (Array.isArray(name)) name = name[0];
  if (typeof name !== 'string' || !name) {
    try {
      const segs = new URL(req.url || '/', 'http://local').pathname.split('/').filter(Boolean);
      name = segs[segs.length - 1] || '';
    } catch {
      name = '';
    }
  }
  return name;
}

/**
 * @param {Record<string, (req, res) => any>} routes  name -> handler (or async loader returning a module)
 * @param {string} param  the dynamic segment name, e.g. 'action' for api/admin/[action].js
 */
export function createDispatcher(routes, param) {
  const table = new Map(Object.entries(routes));
  return async function dispatch(req, res) {
    const name = routeName(req, param);
    const handler = /^[a-z0-9-]{1,64}$/.test(name) ? table.get(name) : undefined;
    if (!handler) return sendJson(res, 404, { error: `unknown route: ${String(name).slice(0, 64)}` });
    return handler(req, res);
  };
}
