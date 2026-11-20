#!/usr/bin/env node
/**
 * Local stand-in for Vercel's Node.js runtime: serves api/**.js on http://127.0.0.1:<port>/api/**.
 *
 * The request/response helpers mirror @vercel/node's serverless-functions/helpers.ts (v5.x):
 *   - req.query   lazy; repeated keys become arrays
 *   - req.cookies lazy
 *   - req.body    lazy, parsed by Content-Type: application/json -> object ('' -> {}), invalid JSON
 *                 throws ApiError(400,'Invalid JSON') at ACCESS time; x-www-form-urlencoded -> object;
 *                 text/plain -> string; octet-stream -> Buffer; other -> undefined. No Content-Type -> body not read.
 *   - the raw body is buffered and the stream is "restored" (req.read / req.on('data'|'end') replay it),
 *     so routes that read the raw stream (webhooks) behave like on Vercel. Vercel ignores
 *     config.api.bodyParser for non-Next functions; the lazy body makes it harmless either way.
 *   - res.status(), res.json(), res.send(), res.redirect()
 *   - an exception escaping the handler -> 500 FUNCTION_INVOCATION_FAILED (Vercel does not catch ApiError).
 *
 *   - api/[param].js dynamic segments (one function serving several routes) -> req.query[param]
 *
 * Usage: node scripts/local-server.mjs [port]   (default 3001; also LOCAL_API_PORT)
 */
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { parse as parseQS } from 'node:querystring';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.LOCAL_API_PORT || 3001);

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeContentType(ct) {
  if (!ct) return 'text/plain';
  return String(ct).split(';')[0].trim().toLowerCase();
}
function getBodyParser(body, contentType) {
  return function parseBody() {
    const type = normalizeContentType(contentType);
    if (type === 'application/json') {
      try {
        const str = body.toString();
        return str ? JSON.parse(str) : {};
      } catch {
        throw new ApiError(400, 'Invalid JSON');
      }
    }
    if (type === 'application/octet-stream') return body;
    if (type === 'application/x-www-form-urlencoded') return parseQS(body.toString());
    if (type === 'text/plain') return body.toString();
    return undefined;
  };
}
function getQueryParser({ url = '/' }) {
  return function parseQuery() {
    const u = new URL(url, 'http://localhost');
    const query = {};
    u.searchParams.forEach((value, key) => {
      const ex = query[key];
      query[key] = ex !== undefined ? (Array.isArray(ex) ? [...ex, value] : [ex, value]) : value;
    });
    return query;
  };
}
function setLazyProp(req, prop, getter) {
  const opts = { configurable: true, enumerable: true };
  const optsReset = { ...opts, writable: true };
  Object.defineProperty(req, prop, {
    ...opts,
    get: () => {
      const value = getter();
      Object.defineProperty(req, prop, { ...optsReset, value });
      return value;
    },
    set: (value) => Object.defineProperty(req, prop, { ...optsReset, value })
  });
}
function restoreBody(req, body) {
  const replicate = new PassThrough();
  const on = replicate.on.bind(replicate);
  const originalOn = req.on.bind(req);
  req.read = replicate.read.bind(replicate);
  req.on = req.addListener = (name, cb) => (name === 'data' || name === 'end' ? on(name, cb) : originalOn(name, cb));
  replicate.write(body);
  replicate.end();
}
async function streamToBuffer(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}
function send(req, res, body) {
  let chunk = body;
  if (typeof chunk === 'string') {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'text/html');
  } else if (Buffer.isBuffer(chunk)) {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/octet-stream');
  } else if (chunk !== null && chunk !== undefined && typeof chunk === 'object') {
    return json(req, res, chunk);
  }
  if (res.statusCode === 204 || res.statusCode === 304) chunk = '';
  res.end(req.method === 'HEAD' ? undefined : chunk);
  return res;
}
function json(req, res, obj) {
  if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
  return send(req, res, JSON.stringify(obj));
}
async function addHelpers(req, res) {
  setLazyProp(req, 'cookies', () => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => c.trim().split('=').map(decodeURIComponent))));
  setLazyProp(req, 'query', getQueryParser(req));
  const contentType = req.headers['content-type'];
  let body = Buffer.from('');
  if (contentType !== undefined) {
    body = req.method !== 'GET' && req.method !== 'HEAD' ? await streamToBuffer(req) : Buffer.from('');
    restoreBody(req, body);
  }
  setLazyProp(req, 'body', getBodyParser(body, contentType));
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => json(req, res, obj);
  res.send = (b) => send(req, res, b);
  res.redirect = (a, b) => { const [code, loc] = typeof a === 'string' ? [307, a] : [a, b]; res.writeHead(code, { Location: loc }).end(); return res; };
}

const modules = new Map();
/**
 * Vercel filesystem routing for api/**: an exact file wins (api/coach.js); otherwise a single
 * dynamic segment file in the same directory (api/admin/[action].js) matches and its value is
 * exposed as req.query[action]. Files/segments starting with "_" or "." are never routes.
 * Returns { handler, params } or null.
 */
async function loadRoute(pathname) {
  const rel = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!/^api(\/[A-Za-z0-9-][A-Za-z0-9_-]*)+$/.test(rel)) return null;
  let file = path.join(ROOT, `${rel}.js`);
  const params = {};
  if (!existsSync(file)) {
    const dir = path.join(ROOT, path.dirname(rel));
    const seg = path.basename(rel);
    const dyn = existsSync(dir) ? readdirSync(dir).find((f) => /^\[[A-Za-z0-9_]+\]\.js$/.test(f)) : null;
    if (!dyn) return null;
    file = path.join(dir, dyn);
    params[dyn.slice(1, -4)] = seg;
  }
  if (!modules.has(file)) modules.set(file, await import(pathToFileURL(file).href));
  return { handler: modules.get(file).default, params };
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const { pathname } = new URL(req.url, 'http://localhost');
  res.on('finish', () => process.env.LOCAL_SERVER_QUIET || console.log(`${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - started} ms)`));
  try {
    const route = await loadRoute(pathname);
    if (!route) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain');
      return res.end('The page could not be found. NOT_FOUND');
    }
    await addHelpers(req, res);
    if (Object.keys(route.params).length) req.query = { ...req.query, ...route.params }; // like Vercel's path segments
    await route.handler(req, res);
  } catch (err) {
    console.error(`[local-server] ${req.method} ${pathname} crashed:`, err?.stack || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain');
      res.end('A server error has occurred FUNCTION_INVOCATION_FAILED');
    } else res.end();
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`local Vercel-style API on http://127.0.0.1:${PORT}/api`));
