/**
 * Build-time prerender for marketing pages and /exams guides.
 *
 * - /about, /faq, /funding, /privacy, /terms: full HTML in #root, module script kept, so the React
 *   page takes over on load (src/main.jsx waits for the page chunk before rendering, no flash).
 * - /exams, /exams/<slug> and /exams/<slug>/<plan>: full static HTML, no module script (like the blog).
 * - /app: correct head only (the study app is client-only).
 * - /: the landing page is rendered into dist/index.html (hydrated). The root carries
 *   data-prerendered="landing" so src/main.jsx discards that markup if the file is ever served as
 *   an SPA fallback for another path (vite preview, Vercel previews). Cloudflare serves /app and
 *   /app/<tab> from dist/app/index.html, which has an empty root.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { REPO_ROOT } from './blog-data.mjs';
import {
  routeMeta,
  breadcrumbJsonLd,
  faqPageJsonLd,
  EXAM_PAGES,
  SITE_ORIGIN
} from '../src/seo/site.js';

const HYDRATED = ['/about', '/faq', '/funding', '/privacy', '/terms'];

/**
 * Real numbers for the /funding books, fetched once at build time from the public GET /api/stats
 * (the same endpoint the page calls in the browser). Returns null on any failure or odd shape, and
 * the page then shows a neutral "Loading…" state until the live fetch lands. Never invents figures.
 * OEH_STATS_URL overrides the source; OEH_PRERENDER_STATS=0 skips the fetch (offline builds).
 */
export async function fetchBooksSnapshot({
  url = process.env.OEH_STATS_URL || `${SITE_ORIGIN}/api/stats`,
  timeoutMs = 6000,
  fetchImpl = globalThis.fetch
} = {}) {
  if (process.env.OEH_PRERENDER_STATS === '0' || typeof fetchImpl !== 'function') return null;
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const out = await res.json();
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(out) || !isObj(out.treasury) || !isObj(out.usageTotal)) return null;
    return {
      fetchedAt: new Date().toISOString(),
      treasury: out.treasury,
      usage: isObj(out.usage) ? out.usage : null,
      usageTotal: out.usageTotal,
      stats: isObj(out.stats) ? out.stats : null
    };
  } catch {
    return null;
  }
}

/** Inline script that hands the snapshot to the hydrating client (JSON with "<" escaped). */
export function booksSnapshotScript(snap) {
  const json = JSON.stringify(snap).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script>window.__OEH_BOOKS__=${json};</script>`;
}

async function bundleSsr() {
  const outfile = path.join(REPO_ROOT, 'dist', '.pages-ssr.mjs');
  await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, 'src/seo/ssr.jsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    jsx: 'automatic',
    loader: { '.json': 'json' },
    external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    logLevel: 'silent'
  });
  return outfile;
}

function nameFor(p) {
  const labels = { '/about': 'About', '/faq': 'FAQ', '/funding': 'Funding', '/privacy': 'Privacy', '/terms': 'Terms', '/app': 'Planner', '/exams': 'Exams' };
  return labels[p];
}

export async function prerenderPages(distDir, template, { applyHead, injectRoot, stripModuleScripts, writePage, posts }) {
  const ssrFile = await bundleSsr();
  const ssr = await import(pathToFileURL(ssrFile).href);
  const written = [];

  const headFor = (p, jsonLd = [], type = 'website') => {
    const meta = routeMeta(p);
    if (!meta) throw new Error(`prerender: no meta for ${p}`);
    return applyHead(template, { ...meta, type, jsonLd, rss: false });
  };

  const books = await fetchBooksSnapshot();
  console.log(books ? `prerender: /funding books baked from /api/stats (${books.fetchedAt})` : 'prerender: /funding books not baked (stats unavailable); page shows a loading state');

  for (const p of HYDRATED) {
    const jsonLd = [breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: nameFor(p), path: p }])];
    if (p === '/faq') jsonLd.push(faqPageJsonLd(ssr.FAQ));
    const withBooks = p === '/funding' && books;
    if (withBooks) globalThis.__OEH_BOOKS__ = books;
    let html;
    try {
      html = injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts));
    } finally {
      delete globalThis.__OEH_BOOKS__;
    }
    if (withBooks) html = html.replace('</head>', `    ${booksSnapshotScript(books)}\n  </head>`);
    writePage(distDir, p, html);
    written.push(p);
  }

  // /tools/clb-converter: interactive, so the module script stays and React takes over on load.
  {
    const p = ssr.TOOL_PATH;
    const url = `${SITE_ORIGIN}${p}`;
    const toolLd = [
      breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'NCLC score converter', path: p }]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${url}#webapp`,
        name: ssr.TOOL_H1,
        url,
        description: ssr.TOOL_DESCRIPTION,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        inLanguage: 'en',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', category: 'Free' },
        dateModified: ssr.TOOL_LAST_VERIFIED,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        publisher: { '@id': `${SITE_ORIGIN}/#organization` }
      },
      faqPageJsonLd(ssr.TOOL_FAQ)
    ];
    writePage(distDir, p, injectRoot(headFor(p, toolLd), ssr.renderPage(p, posts)));
    written.push(p);
  }

  writePage(distDir, '/app', headFor('/app'));
  written.push('/app');

  const indexLd = [breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Exams', path: '/exams' }])];
  writePage(distDir, '/exams', stripModuleScripts(injectRoot(headFor('/exams', indexLd), ssr.renderPage('/exams', posts))));
  written.push('/exams');

  for (const page of EXAM_PAGES) {
    const p = `/exams/${page.slug}`;
    const c = ssr.examContent(page.slug);
    const jsonLd = [
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Exams', path: '/exams' },
        { name: page.label, path: p }
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${SITE_ORIGIN}${p}#webpage`,
        url: `${SITE_ORIGIN}${p}`,
        name: page.title,
        description: page.description,
        inLanguage: 'en',
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        about: { '@type': 'Thing', name: page.label },
        ...(c.lastChecked ? { lastReviewed: c.lastChecked } : {})
      }
    ];
    const faq = faqPageJsonLd(c.faq);
    if (faq) jsonLd.push(faq);
    writePage(distDir, p, stripModuleScripts(injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts))));
    written.push(p);
  }

  for (const plan of ssr.PLAN_PAGES) {
    const p = ssr.planPath(plan);
    const guide = EXAM_PAGES.find((g) => g.slug === plan.guide);
    if (!guide) throw new Error(`prerender: plan ${p} has no parent guide`);
    const url = `${SITE_ORIGIN}${p}`;
    const jsonLd = [
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Exams', path: '/exams' },
        { name: guide.label, path: `/exams/${guide.slug}` },
        { name: plan.breadcrumb, path: p }
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: plan.title,
        description: plan.description,
        inLanguage: 'en',
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        about: { '@type': 'Thing', name: guide.label },
        lastReviewed: plan.lastChecked
      },
      {
        // Free self-paced study plan published by OpenExam Hub. No dates, workload or outcome claims.
        '@context': 'https://schema.org',
        '@type': 'Course',
        '@id': `${url}#course`,
        name: plan.label,
        description: plan.description,
        url,
        inLanguage: 'en',
        isAccessibleForFree: true,
        educationalLevel: plan.level,
        provider: { '@id': `${SITE_ORIGIN}/#organization` },
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', category: 'Free' }
      }
    ];
    const faq = faqPageJsonLd(plan.faq);
    if (faq) jsonLd.push(faq);
    writePage(distDir, p, stripModuleScripts(injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts))));
    written.push(p);
  }

  // Last, because `template` (the original dist/index.html) is the shell every page above starts from.
  const landing = injectRoot(template, ssr.renderPage('/', posts)).replace('<div id="root">', '<div id="root" data-prerendered="landing">');
  fs.writeFileSync(path.join(distDir, 'index.html'), landing);
  written.push('/');

  try {
    fs.unlinkSync(ssrFile);
  } catch {
    // ignore
  }
  return written;
}
