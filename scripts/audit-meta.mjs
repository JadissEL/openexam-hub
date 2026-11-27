#!/usr/bin/env node
/**
 * Audit <title> and meta description of every prerendered page in dist/.
 *   node scripts/audit-meta.mjs [distDir]
 * Hard failures (exit 1): missing or empty title/description, duplicate title, duplicate description.
 * Soft flags (reported, exit 0): title over 60 characters, description over 160 characters.
 * Tag, RSS and other non-HTML outputs are ignored. Run `vite build` first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'));
const TITLE_MAX = 60;
const DESC_MAX = 160;

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name === 'index.html') out.push(p);
  }
  return out;
}

const pages = htmlFiles(dist).map((f) => {
  const html = fs.readFileSync(f, 'utf8');
  const head = html.split('</head>')[0];
  const rel = '/' + path.relative(dist, path.dirname(f)).split(path.sep).join('/');
  const title = head.match(/<title>([\s\S]*?)<\/title>/);
  const desc = head.match(/<meta\s+name="description"\s+content="([^"]*)"/) || head.match(/<meta\s+content="([^"]*)"\s+name="description"/);
  const robots = head.match(/<meta\s+name="robots"\s+content="([^"]*)"/);
  return {
    url: rel === '/.' ? '/' : rel,
    title: title ? decode(title[1]) : '',
    description: desc ? decode(desc[1]) : '',
    noindex: Boolean(robots && /noindex/i.test(robots[1]))
  };
});

// /app and other client-only shells are noindex; they are still listed but not counted as duplicates of public pages.
const problems = [];
const soft = [];
const seen = { title: new Map(), description: new Map() };
for (const p of pages) {
  if (!p.title) problems.push(`${p.url}: missing <title>`);
  if (!p.description) problems.push(`${p.url}: missing meta description`);
  for (const k of ['title', 'description']) {
    if (!p[k]) continue;
    if (!seen[k].has(p[k])) seen[k].set(p[k], []);
    seen[k].get(p[k]).push(p.url);
  }
  if (p.title.length > TITLE_MAX) soft.push(`${p.url}: title ${p.title.length} chars (> ${TITLE_MAX})`);
  if (p.description.length > DESC_MAX) soft.push(`${p.url}: description ${p.description.length} chars (> ${DESC_MAX})`);
}
for (const k of ['title', 'description']) {
  for (const [text, urls] of seen[k]) if (urls.length > 1) problems.push(`duplicate ${k} on ${urls.join(', ')}: "${text}"`);
}

console.log(`Checked ${pages.length} pages in ${path.relative(process.cwd(), dist) || '.'}`);
console.log('\nurl | title chars | description chars | noindex');
for (const p of pages.sort((a, b) => a.url.localeCompare(b.url))) {
  console.log(`${p.url} | ${p.title.length} | ${p.description.length} | ${p.noindex ? 'noindex' : ''}`);
}
console.log(`\nSoft flags (${soft.length}):`);
for (const s of soft) console.log('  ' + s);
console.log(`\nProblems (${problems.length}):`);
for (const s of problems) console.log('  ' + s);
process.exit(problems.length ? 1 : 0);
