/**
 * /funding prerender: the books are baked from GET /api/stats at build time, or shown as a neutral
 * loading state. Never a bare dash, never invented numbers.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { fetchBooksSnapshot, booksSnapshotScript } from './prerender-pages.mjs';
import { REPO_ROOT } from './blog-data.mjs';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}
const STATS = {
  stats: { resources: 90, plansBuilt: 3, cacheHits: 1, cacheHitRate: 0.25 },
  usage: { month: '2026-11', calls: 4, promptTokens: 10, completionTokens: 20, costEur: 0 },
  usageTotal: { calls: 4, costEur: 0.42 },
  treasury: { communityTotalEur: 12.5, adsenseBridge: 0 }
};
const fakeFetch = (body, ok = true) => async () => ({ ok, json: async () => body });

await test('snapshot: valid /api/stats payload is kept, with a fetchedAt stamp', async () => {
  const s = await fetchBooksSnapshot({ fetchImpl: fakeFetch(STATS) });
  assert.equal(s.treasury.communityTotalEur, 12.5);
  assert.equal(s.usageTotal.costEur, 0.42);
  assert.ok(!Number.isNaN(Date.parse(s.fetchedAt)));
});
await test('snapshot: HTTP error, bad shape or network failure -> null (no made-up numbers)', async () => {
  assert.equal(await fetchBooksSnapshot({ fetchImpl: fakeFetch(STATS, false) }), null);
  assert.equal(await fetchBooksSnapshot({ fetchImpl: fakeFetch({ stats: {} }) }), null);
  assert.equal(await fetchBooksSnapshot({ fetchImpl: async () => { throw new Error('offline'); } }), null);
});
await test('snapshot script escapes "<" so stats text cannot close the tag', () => {
  const html = booksSnapshotScript({ fetchedAt: 'x', treasury: { note: '</script><b>' }, usageTotal: {} });
  assert.ok(!html.slice(8, -9).includes('<'));
});

// Server-render /funding with and without a snapshot.
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oeh-fund-')), 'ssr.mjs');
await esbuild.build({
  entryPoints: [path.join(REPO_ROOT, 'src/seo/ssr.jsx')], bundle: true, format: 'esm', platform: 'node', outfile: out,
  jsx: 'automatic', loader: { '.json': 'json' }, logLevel: 'silent',
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  nodePaths: [path.join(REPO_ROOT, 'node_modules')]
});
fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(path.dirname(out), 'node_modules'));
const ssr = await import(pathToFileURL(out).href);
const books = (html) => html.slice(html.indexOf('Earnings so far'), html.indexOf('expenses-list-title'));

await test('funding prerender without stats: neutral "Loading…", no dash, no numbers', () => {
  delete globalThis.__OEH_BOOKS__;
  const b = books(ssr.renderPage('/funding'));
  assert.ok(b.includes('Loading…'));
  assert.ok(!b.includes('—'));
  assert.ok(!b.includes('text-2xl font-bold tabular-nums'), 'no figure is rendered before data exists');
});
await test('funding prerender with a build snapshot: real figures and an "as of" date', () => {
  globalThis.__OEH_BOOKS__ = { fetchedAt: '2026-11-21T00:00:00.000Z', ...STATS };
  const html = ssr.renderPage('/funding');
  delete globalThis.__OEH_BOOKS__;
  const b = books(html);
  assert.ok(b.includes('12.50'), 'earnings from the snapshot');
  assert.ok(!b.includes('Loading…') && !b.includes('—'));
  assert.ok(html.includes('Figures as of 21 Nov 2026'));
});
console.log(`${passed} funding-prerender tests passed`);
