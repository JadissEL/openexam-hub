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
import { ENABLED_LOCALES, localeMeta } from '../src/i18n/locales.js';
import { localizePath } from '../src/i18n/paths.js';
import { isPagePublished, localizedRouteMeta } from '../src/i18n/publish.js';
import { registerCatalog, translate } from '../src/i18n/runtime.js';
import { loadCatalog } from './load-catalog.mjs';

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

export async function prerenderPages(distDir, template, args) {
  if (!args._localeLoop) {
    for (const code of ENABLED_LOCALES) {
      const cat = loadCatalog(code);
      if (cat) registerCatalog(code, cat);
    }
    const ssrFile = await bundleSsr();
    const ssr = await import(pathToFileURL(ssrFile).href);
    for (const code of ENABLED_LOCALES) {
      const cat = loadCatalog(code);
      if (cat && ssr.registerCatalog) ssr.registerCatalog(code, cat);
    }
    const written = [];
    for (const code of ['en', ...ENABLED_LOCALES]) {
      written.push(...(await prerenderPages(distDir, template, { ...args, locale: code, _localeLoop: true, _ssr: ssr })));
    }
    try {
      fs.unlinkSync(ssrFile);
    } catch {
      // ignore
    }
    return written;
  }

  const { applyHead, injectRoot, stripModuleScripts, writePage, posts } = args;
  const locale = args.locale || 'en';
  const ssr = args._ssr;
  const lang = localeMeta(locale).htmlLang;
  const written = [];
  const homeName = translate(locale, 'crumb.home');

  const headFor = (p, jsonLd = [], type = 'website') => {
    if (locale !== 'en' && !isPagePublished(locale, p)) return null;
    const meta = localizedRouteMeta(p, locale) || (locale === 'en' ? routeMeta(p) : null);
    if (!meta) throw new Error(`prerender: no meta for ${locale} ${p}`);
    return applyHead(template, {
      ...meta,
      type,
      jsonLd,
      rss: false,
      lang: meta.lang || lang,
      dir: meta.dir || 'ltr',
      alternates: meta.alternates || [],
      ogLocale: meta.ogLocale || null,
      ogLocaleAlternates: meta.ogLocaleAlternates || [],
      fontHref: meta.fontHref || null
    });
  };

  const crumbs = (items) => breadcrumbJsonLd(items.map((item) => ({
    ...item,
    name: item.name === 'Home' ? homeName : item.name === 'Compare tests' ? translate(locale, 'footer.compare') : item.name,
    path: localizePath(locale, item.path)
  })));

  const emit = (p, build) => {
    if (locale !== 'en' && !isPagePublished(locale, p)) return;
    const html = build();
    if (!html) return;
    const dest = locale === 'en' ? p : localizePath(locale, p);
    writePage(distDir, dest, html);
    written.push(dest);
  };

  const books = await fetchBooksSnapshot();
  console.log(books ? `prerender: /funding books baked from /api/stats (${books.fetchedAt})` : 'prerender: /funding books not baked (stats unavailable); page shows a loading state');

  for (const p of HYDRATED) {
    const jsonLd = [crumbs([{ name: homeName, path: '/' }, { name: nameFor(p), path: p }])];
    if (p === '/faq') jsonLd.push(faqPageJsonLd(ssr.FAQ));
    const withBooks = p === '/funding' && books;
    if (withBooks) globalThis.__OEH_BOOKS__ = books;
    let html;
    try {
      html = injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts, locale));
    } finally {
      delete globalThis.__OEH_BOOKS__;
    }
    if (withBooks) html = html.replace('</head>', `    ${booksSnapshotScript(books)}\n  </head>`);
    emit(p, () => html);
  }

  // /tools/clb-converter: interactive, so the module script stays and React takes over on load.
  {
    const p = ssr.TOOL_PATH;
    const url = `${SITE_ORIGIN}${p}`;
    const toolLd = [
      crumbs([{ name: homeName, path: '/' }, { name: 'CLB / NCLC score converter', path: p }]),
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
        inLanguage: lang,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', category: 'Free' },
        dateModified: ssr.TOOL_LAST_VERIFIED,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        publisher: { '@id': `${SITE_ORIGIN}/#organization` }
      },
      faqPageJsonLd(ssr.TOOL_FAQ)
    ];
    emit(p, () => injectRoot(headFor(p, toolLd), ssr.renderPage(p, posts, locale)));
  }

  // /tools/crs-language-points: interactive like the converter (module script stays).
  {
    const p = ssr.CRS_TOOL_PATH;
    const url = `${SITE_ORIGIN}${p}`;
    const ld = [
      crumbs([{ name: homeName, path: '/' }, { name: 'CRS language points', path: p }]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${url}#webapp`,
        name: ssr.CRS_TOOL_H1,
        url,
        description: ssr.CRS_TOOL_DESCRIPTION,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        inLanguage: lang,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', category: 'Free' },
        dateModified: ssr.CRS_LAST_VERIFIED,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        publisher: { '@id': `${SITE_ORIGIN}/#organization` }
      },
      faqPageJsonLd(ssr.CRS_TOOL_FAQ)
    ];
    emit(p, () => injectRoot(headFor(p, ld), ssr.renderPage(p, posts, locale)));
  }

  // /tools/cefr-converter: interactive like the converter (module script stays).
  {
    const p = ssr.CEFR_TOOL_PATH;
    const url = `${SITE_ORIGIN}${p}`;
    const ld = [
      crumbs([{ name: homeName, path: '/' }, { name: 'CEFR level converter', path: p }]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${url}#webapp`,
        name: ssr.CEFR_TOOL_H1,
        url,
        description: ssr.CEFR_TOOL_DESCRIPTION,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        inLanguage: lang,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', category: 'Free' },
        dateModified: ssr.CEFR_LAST_VERIFIED,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        publisher: { '@id': `${SITE_ORIGIN}/#organization` }
      },
      faqPageJsonLd(ssr.CEFR_TOOL_FAQ)
    ];
    emit(p, () => injectRoot(headFor(p, ld), ssr.renderPage(p, posts, locale)));
  }

  // /compare/<slug>: static comparison pages (IDEA-13). Full HTML, no module script, no ads.
  for (const page of ssr.COMPARE_PAGES) {
    const p = ssr.comparePath(page);
    const url = `${SITE_ORIGIN}${p}`;
    const jsonLd = [
      crumbs(ssr.compareBreadcrumbs(page)),
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.h1,
        description: page.description,
        inLanguage: lang,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        lastReviewed: ssr.COMPARE_LAST_VERIFIED
      }
    ];
    const faq = faqPageJsonLd(page.faq);
    if (faq) jsonLd.push(faq);
    emit(p, () => stripModuleScripts(injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts, locale))));
  }

  {
    const page = ssr.CLB_TABLE_PAGE;
    const p = page.path;
    const url = `${SITE_ORIGIN}${p}`;
    const csvUrl = `${SITE_ORIGIN}${page.csvPath}`;
    const jsonLd = [
      crumbs(ssr.compareBreadcrumbs(page)),
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: page.h1,
        description: page.description,
        url,
        inLanguage: lang,
        isAccessibleForFree: true,
        dateModified: ssr.COMPARE_LAST_VERIFIED,
        isBasedOn: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html',
        creator: { '@id': `${SITE_ORIGIN}/#organization` },
        distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: csvUrl }]
      }
    ];
    const faq = faqPageJsonLd(page.faq);
    if (faq) jsonLd.push(faq);
    emit(p, () => stripModuleScripts(injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts, locale))));
    fs.writeFileSync(path.join(distDir, page.csvPath.slice(1)), ssr.clbCsv());
  }
  {
    const p = ssr.COMPARE_HUB.path;
    const jsonLd = [
      crumbs([{ name: homeName, path: '/' }, { name: ssr.COMPARE_HUB.label, path: p }]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${SITE_ORIGIN}${p}#webpage`,
        url: `${SITE_ORIGIN}${p}`,
        name: ssr.COMPARE_HUB.h1,
        description: ssr.COMPARE_HUB.description,
        inLanguage: lang,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` }
      }
    ];
    emit(p, () => stripModuleScripts(injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts, locale))));
  }

  emit('/app', () => headFor('/app'));

  const indexLd = [crumbs([{ name: homeName, path: '/' }, { name: translate(locale, 'crumb.exams'), path: '/exams' }])];
  emit('/exams', () => stripModuleScripts(injectRoot(headFor('/exams', indexLd), ssr.renderPage('/exams', posts, locale))));

  for (const page of EXAM_PAGES) {
    const p = `/exams/${page.slug}`;
    const c = ssr.examContent(page.slug);
    const jsonLd = [
      crumbs([
        { name: homeName, path: '/' },
        { name: translate(locale, 'crumb.exams'), path: '/exams' },
        { name: page.label, path: p }
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${SITE_ORIGIN}${p}#webpage`,
        url: `${SITE_ORIGIN}${p}`,
        name: page.title,
        description: page.description,
        inLanguage: lang,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        about: { '@type': 'Thing', name: page.label },
        ...(c.lastChecked ? { lastReviewed: c.lastChecked } : {})
      }
    ];
    const faq = faqPageJsonLd(c.faq);
    if (faq) jsonLd.push(faq);
    emit(p, () => stripModuleScripts(injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts, locale))));
  }

  for (const plan of ssr.PLAN_PAGES) {
    const p = ssr.planPath(plan);
    const guide = EXAM_PAGES.find((g) => g.slug === plan.guide);
    if (!guide) throw new Error(`prerender: plan ${p} has no parent guide`);
    const url = `${SITE_ORIGIN}${p}`;
    const jsonLd = [
      crumbs([
        { name: homeName, path: '/' },
        { name: translate(locale, 'crumb.exams'), path: '/exams' },
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
        inLanguage: lang,
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
        inLanguage: lang,
        isAccessibleForFree: true,
        educationalLevel: plan.level,
        provider: { '@id': `${SITE_ORIGIN}/#organization` },
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', category: 'Free' }
      }
    ];
    const faq = faqPageJsonLd(plan.faq);
    if (faq) jsonLd.push(faq);
    emit(p, () => stripModuleScripts(injectRoot(headFor(p, jsonLd), ssr.renderPage(p, posts, locale))));
  }

  // Last, because `template` (the original dist/index.html) is the shell every page above starts from.
  // English keeps that shell so the home Open Graph description stays the one shipped in index.html.
  if (locale === 'en') {
    const landing = injectRoot(template, ssr.renderPage('/', posts, locale)).replace('<div id="root">', '<div id="root" data-prerendered="landing">');
    const meta = localizedRouteMeta('/', 'en');
    const links = (meta?.alternates || []).map((alt) => `    <link rel="alternate" hreflang="${alt.hreflang}" href="${alt.href}" />`).join('\n');
    const og = meta?.ogLocale ? `    <meta property="og:locale" content="${meta.ogLocale}" />` : '';
    const withLocale = landing
      .replace(/<html\b[^>]*>/, '<html lang="en" dir="ltr">')
      .replace('</head>', `${links}\n${og}\n  </head>`);
    fs.writeFileSync(path.join(distDir, 'index.html'), withLocale);
    written.push('/');
  } else if (isPagePublished(locale, '/')) {
    const home = ssr.localizedUnit ? ssr.localizedUnit(locale, 'landing:home') : null;
    const faq = ssr.localizedUnit ? ssr.localizedUnit(locale, 'landing:faq') : null;
    const landingLd = [
      crumbs([{ name: homeName, path: localizePath(locale, '/') }]),
      ...(faq?.items ? [faqPageJsonLd(faq.items.slice(0, 5))] : [])
    ];
    emit('/', () => injectRoot(headFor('/', landingLd), ssr.renderPage('/', posts, locale)).replace('<div id="root">', '<div id="root" data-prerendered="landing">'));
  }

  return written;
}
