#!/usr/bin/env node
/**
 * Local-only static server for the growth tracker.
 * Not part of the live site. Serves docs/growth + persists progress to disk.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const IDEAS_DIR = path.join(ROOT, '..', 'ideas');
const IDEAS_JSON = path.join(IDEAS_DIR, 'ideas.json');
const IDEAS_JSON_FALLBACK = path.join(ROOT, 'ideas.json');
const PORT = Number(process.env.OEH_TRACKER_PORT || 5179);
const HOST = '127.0.0.1';
const PROGRESS_IN_REPO = path.join(ROOT, 'progress-local.json');
const BACKUP_DIR = path.join(os.homedir(), 'AppData', 'Local', 'OpenExamHub');
const PROGRESS_BACKUP = path.join(BACKUP_DIR, 'oeh-growth-v1.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function readProgressFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function mergeOverrides(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, entry] of Object.entries(b || {})) {
    const prev = out[id];
    if (!prev) {
      out[id] = entry;
      continue;
    }
    const aTime = Date.parse(prev.updatedAt || 0) || 0;
    const bTime = Date.parse(entry?.updatedAt || 0) || 0;
    out[id] = bTime >= aTime ? entry : prev;
  }
  return out;
}

function loadMergedProgress() {
  const repo = readProgressFile(PROGRESS_IN_REPO);
  const backup = readProgressFile(PROGRESS_BACKUP);
  const overrides = mergeOverrides(repo?.overrides || {}, backup?.overrides || {});
  const ideaOverrides = mergeOverrides(repo?.ideaOverrides || {}, backup?.ideaOverrides || {});
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    source: 'disk-merge',
    overrides,
    ideaOverrides,
  };
}

function writeProgress(payload) {
  ensureBackupDir();
  const existing = loadMergedProgress();
  // Partial updates: only replace keys that the client explicitly sent.
  const overrides = Object.prototype.hasOwnProperty.call(payload || {}, 'overrides')
    ? (payload.overrides && typeof payload.overrides === 'object' ? payload.overrides : {})
    : (existing.overrides || {});
  const ideaOverrides = Object.prototype.hasOwnProperty.call(payload || {}, 'ideaOverrides')
    ? (payload.ideaOverrides && typeof payload.ideaOverrides === 'object' ? payload.ideaOverrides : {})
    : (existing.ideaOverrides || {});
  const body = JSON.stringify(
    {
      version: 1,
      savedAt: new Date().toISOString(),
      overrides,
      ideaOverrides,
    },
    null,
    2
  );
  fs.writeFileSync(PROGRESS_IN_REPO, body, 'utf8');
  fs.writeFileSync(PROGRESS_BACKUP, body, 'utf8');
  return { ok: true, savedAt: new Date().toISOString(), paths: [PROGRESS_IN_REPO, PROGRESS_BACKUP] };
}

function loadIdeasCatalog() {
  const candidates = [IDEAS_JSON, IDEAS_JSON_FALLBACK];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data && Array.isArray(data.ideas)) return data;
    } catch {
      /* try next */
    }
  }
  return null;
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0]);
  let rel = decoded.replace(/^\/+/, '');
  if (!rel || rel === 'tracker') rel = 'tracker.html';
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return null;
  return full;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (url.pathname === '/api/progress' || url.pathname === '/api/progress/') {
    if (req.method === 'GET') {
      send(res, 200, JSON.stringify(loadMergedProgress()), 'application/json; charset=utf-8');
      return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const data = JSON.parse(raw || '{}');
        const result = writeProgress(data);
        send(res, 200, JSON.stringify(result), 'application/json; charset=utf-8');
      } catch (err) {
        send(res, 400, JSON.stringify({ ok: false, error: String(err.message || err) }), 'application/json; charset=utf-8');
      }
      return;
    }
    send(res, 405, 'Method not allowed');
    return;
  }

  if (url.pathname === '/api/health') {
    send(res, 200, JSON.stringify({ ok: true, port: PORT }), 'application/json; charset=utf-8');
    return;
  }

  if (url.pathname === '/api/ideas' || url.pathname === '/api/ideas/') {
    const data = loadIdeasCatalog();
    if (!data) {
      send(res, 404, JSON.stringify({ ok: false, error: 'ideas.json not found' }), 'application/json; charset=utf-8');
      return;
    }
    send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8');
    return;
  }

  if (url.pathname === '/ideas' || url.pathname === '/ideas/') {
    res.writeHead(302, {
      Location: '/ideas.html',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end();
    return;
  }

  // Serve markdown specs from docs/ideas (deep links from the cockpit).
  if (url.pathname.startsWith('/idea-docs/')) {
    const name = path.basename(url.pathname);
    if (!/^IDEA-\d{2}-[a-z0-9-]+\.md$/i.test(name) && name !== 'README.md') {
      send(res, 400, 'Bad idea doc name');
      return;
    }
    const target = path.join(IDEAS_DIR, name);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      send(res, 404, 'Idea doc not found');
      return;
    }
    send(res, 200, fs.readFileSync(target), 'text/markdown; charset=utf-8');
    return;
  }

  const filePath = safeJoin(ROOT, url.pathname);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  let target = filePath;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    send(res, 404, 'Not found');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  send(res, 200, fs.readFileSync(target), type);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // Another instance already serves this port — launcher can open the browser anyway.
    console.log(`ALREADY_RUNNING ${HOST}:${PORT}`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`OEH_TRACKER http://${HOST}:${PORT}/tracker.html`);
  console.log(`OEH_IDEAS   http://${HOST}:${PORT}/ideas.html`);
  console.log(`PROGRESS_REPO ${PROGRESS_IN_REPO}`);
  console.log(`PROGRESS_BACKUP ${PROGRESS_BACKUP}`);
});
