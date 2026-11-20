/**
 * Build-time prerender for marketing pages and /exams guides.
 *
 * - /about, /faq, /funding, /privacy, /terms: full HTML in #root, module script kept, so the React
 *   page takes over on load (src/main.jsx waits for the page chunk before rendering, no flash).
 * - /exams, /exams/<slug> and /exams/<slug>/<plan>: full static HTML, no module script (like the blog).
 * - /app: correct head only (the study app is client-only).
 * - / is left alone: dist/index.html is also the SPA fallback for /app and unknown paths.
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

  for (const p of HYDRATED) {
    const jsonLd = [breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: nameFor(p), path: p }])];
    if (p === '/faq') jsonLd.push(faqPageJsonLd(ssr.FAQ));
    const body = ssr.renderPage(p, posts);
    writePage(distDir, p, injectRoot(headFor(p, jsonLd), body));
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

  try {
    fs.unlinkSync(ssrFile);
  } catch {
    // ignore
  }
  return written;
}
