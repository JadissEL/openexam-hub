// Cloudflare Worker for openexamhub.org (static hosting on Workers + /api proxied to the Vercel functions).
//
// Static files in dist/ are served by Workers Static Assets WITHOUT invoking this script (free and
// unmetered). This script only runs for:
//   - /api/* and /ads.txt  -> proxied to API_ORIGIN (the Vercel deployment, which still runs the
//                             Node functions and the cron jobs; see DEPLOY.md "Cloudflare Workers")
//   - /blog/               -> same page as /blog (Vercel parity: 200, no redirect)
//   - /demo/*              -> byte-range (206) support for the demo video: Static Assets alone always
//                             answers 200 with the full file, which breaks seeking and Safari playback.
//   - /transparency[/]     -> 301 /funding (legacy public-books URL)
//   - any path with no matching file -> /app/<tab> deep links get the /app shell (200); everything
//                             else is a real 404 (every public page is prerendered, so no soft 404s).
// www.openexamhub.org -> apex 308 is a zone Redirect Rule; the host check below is a backup.

import { sanitizeBeacon } from '../lib/analytics/hits.js';

const APEX = 'openexamhub.org';
// Client-side routes without their own prerendered file: the dashboard's tab deep links (/app/plan, ...).
const APP_SHELL_ROUTE = /^\/app\/[^/]+$/;
// Hop-by-hop / host-specific request headers that must not be forwarded to the origin.
const DROP_REQUEST_HEADERS = ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker', 'x-forwarded-proto', 'x-real-ip', 'x-oeh-client-ip', 'x-oeh-client-country', 'x-oeh-proxy-key'];

function notFound() {
  return new Response('The page could not be found.\n\nNOT_FOUND\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function proxyToApi(request, env, url, pathname) {
  const origin = String(env.API_ORIGIN || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(origin)) {
    return Response.json({ error: 'API origin is not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const target = new URL(pathname + url.search, origin);
  const headers = new Headers(request.headers);
  for (const h of DROP_REQUEST_HEADERS) headers.delete(h);
  headers.set('x-forwarded-host', url.host);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip && env.PROXY_SHARED_SECRET) {
    // Vercel overwrites x-forwarded-for with the connecting (Cloudflare) IP, so the real client IP
    // travels in x-oeh-client-ip, trusted by the API only together with the shared key.
    headers.set('x-oeh-client-ip', ip);
    headers.set('x-oeh-proxy-key', env.PROXY_SHARED_SECRET);
    // Visitor country (2-letter code from Cloudflare), shown in the founder's signup alert.
    const country = request.cf && typeof request.cf.country === 'string' ? request.cf.country : '';
    if (/^[A-Z]{2}$/.test(country)) headers.set('x-oeh-client-country', country);
  }
  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    console.error(JSON.stringify({ msg: 'api proxy failed', path: pathname, error: String(err && err.message) }));
    return Response.json({ error: 'API temporarily unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const out = new Response(upstream.body, upstream);
  // Never leak the origin host in redirects (e.g. a trailing-slash redirect from Vercel).
  const loc = out.headers.get('location');
  if (loc && loc.startsWith(origin)) out.headers.set('location', loc.slice(origin.length) || '/');
  return out;
}

/**
 * POST /api/hit: the cookieless visit counter (lib/analytics/hits.js). The browser beacon carries only
 * {t, p, r, u, e}; here bots are dropped (Cloudflare verified bots + user-agent rules), the in-app
 * browser name is derived from the user agent, and only the stripped record goes on to the API,
 * signed with PROXY_SHARED_SECRET. No IP, user agent, cookie or ID leaves this function.
 * Always answers 204 so the beacon never retries or shows errors.
 */
async function hitBeacon(request, env, ctx) {
  const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  const from = request.headers.get('origin');
  if (from && from !== `https://${APEX}`) return done();
  if (request.cf && request.cf.verifiedBotCategory) return done();
  let body = null;
  try {
    const text = await request.text();
    if (text.length <= 2048) body = JSON.parse(text);
  } catch {
    body = null;
  }
  const rec = sanitizeBeacon(body, request.headers.get('user-agent'));
  const origin = String(env.API_ORIGIN || '').replace(/\/+$/, '');
  if (!rec || !env.PROXY_SHARED_SECRET || !/^https:\/\//.test(origin)) return done();
  const send = fetch(`${origin}/api/hit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-oeh-proxy-key': env.PROXY_SHARED_SECRET },
    body: JSON.stringify(rec)
  }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(send);
  else await send;
  return done();
}

const DEMO_HEADERS = { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' };

function withHeaders(res, extra) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  return out;
}

/** /demo/* through the Cache API, which turns a cached full 200 into 206 slices for Range requests. */
async function demoAsset(request, env, url) {
  const extra = url.pathname.endsWith('.vtt') ? { ...DEMO_HEADERS, 'Content-Type': 'text/vtt; charset=utf-8' } : DEMO_HEADERS;
  const range = request.headers.get('range');
  if (!range || request.method !== 'GET') {
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404) return notFound();
    const out = withHeaders(res, extra);
    out.headers.set('Accept-Ranges', 'bytes');
    return out;
  }
  const plain = new Request(url.toString(), { method: 'GET' });
  const full = await env.ASSETS.fetch(plain);
  if (full.status === 404) return notFound();
  if (full.status !== 200) return withHeaders(full, extra);
  // Key on the asset ETag so a new deploy of the same path never serves stale bytes.
  const etag = (full.headers.get('etag') || '').replace(/[^A-Za-z0-9]/g, '');
  const key = new URL(url.pathname, url);
  key.searchParams.set('__v', etag || 'none');
  const cache = caches.default;
  let hit = await cache.match(new Request(key.toString(), { headers: { Range: range } }));
  if (!hit) {
    await cache.put(key.toString(), withHeaders(full, { ...extra, 'Cache-Control': 'public, max-age=86400' }));
    hit = await cache.match(new Request(key.toString(), { headers: { Range: range } }));
  } else {
    full.body?.cancel();
  }
  if (!hit) return withHeaders(await env.ASSETS.fetch(plain), extra); // Cache API unavailable: full file
  const out = withHeaders(hit, extra);
  out.headers.set('Accept-Ranges', 'bytes');
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === `www.${APEX}`) {
      return Response.redirect(`https://${APEX}${url.pathname}${url.search}`, 308);
    }
    const { pathname } = url;
    // Public books used to be advertised at /transparency; they now live at /funding.
    if (pathname === '/transparency' || pathname === '/transparency/') {
      return Response.redirect(`https://${APEX}/funding${url.search}`, 301);
    }
    if (pathname === '/api/hit') return hitBeacon(request, env, ctx);
    if (pathname.startsWith('/api/')) return proxyToApi(request, env, url, pathname);
    if (pathname === '/ads.txt') return proxyToApi(request, env, url, '/api/ads-txt');

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (pathname.startsWith('/demo/')) return demoAsset(request, env, url);
    if (pathname === '/blog/') return env.ASSETS.fetch(new Request(new URL('/blog', url), request));

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    if (!APP_SHELL_ROUTE.test(pathname)) return notFound();
    const shell = await env.ASSETS.fetch(new Request(new URL('/app', url), request));
    return new Response(shell.body, { status: 200, headers: shell.headers });
  }
};
