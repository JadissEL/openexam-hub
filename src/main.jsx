import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { syncHead } from './seo/head.js';
import { LocaleProvider, applyDocumentLocale } from './i18n/LocaleContext.jsx';
import { splitLocale, isEnglishOnly } from './i18n/paths.js';
import { isPagePublished } from './i18n/publish.js';
import { ENABLED_LOCALES } from './i18n/locales.js';

// Tiny path router. The marketing pages ship without Firebase; the study app (App.jsx and the
// Firebase SDK) is code-split and only downloaded on /app.
const loaders = {
  landing: () => import('./landing/Landing.jsx'),
  legal: () => import('./landing/LegalPage.jsx'),
  info: () => import('./landing/InfoPage.jsx'),
  blog: () => import('./blog/BlogClient.jsx'),
  exams: () => import('./seo/ExamRoute.jsx'),
  tools: () => import('./tools/ClbConverter.jsx'),
  crs: () => import('./tools/CrsLanguagePoints.jsx'),
  cefr: () => import('./tools/CefrConverter.jsx'),
  compare: () => import('./compare/CompareRoute.jsx'),
  app: () => import('./App.jsx')
};

function isBlogPath(p) {
  return p === '/blog' || p.startsWith('/blog/');
}

/** Which page module a path needs, and its props. `pathname` is the English path. */
function resolveRoute(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return { key: 'landing', props: {} };
  if (p === '/privacy') return { key: 'legal', props: { kind: 'privacy' } };
  if (p === '/terms') return { key: 'legal', props: { kind: 'terms' } };
  if (p === '/about') return { key: 'info', props: { kind: 'about' } };
  if (p === '/faq') return { key: 'info', props: { kind: 'faq' } };
  if (p === '/funding') return { key: 'info', props: { kind: 'funding' } };
  if (p === '/exams' || /^\/exams\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(p)) return { key: 'exams', props: { pathname: p } };
  if (p === '/tools/clb-converter') return { key: 'tools', props: {} };
  if (p === '/tools/crs-language-points') return { key: 'crs', props: {} };
  if (p === '/tools/cefr-converter') return { key: 'cefr', props: {} };
  if (p === '/compare') return { key: 'compare', props: {} };
  const cm = p.match(/^\/compare\/([a-z0-9-]+)$/);
  if (cm) return { key: 'compare', props: { slug: cm[1] } };
  if (isBlogPath(p) && p !== '/blog/rss.xml') return { key: 'blog', props: {} };
  return { key: 'app', props: {} }; // /app and any other path open the study app
}

const lazyPages = Object.fromEntries(Object.entries(loaders).map(([k, load]) => [k, lazy(load)]));

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] text-neutral-500 text-sm" role="status">
      Loading…
    </div>
  );
}

const catalogs = import.meta.glob('./i18n/catalogs/*.js');

async function boot() {
  const { locale, path } = splitLocale(window.location.pathname);
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  if (locale !== 'en' && (isEnglishOnly(path) || !ENABLED_LOCALES.includes(locale))) {
    window.location.replace(path + search + hash);
    return;
  }
  if (locale !== 'en') {
    const load = catalogs[`./i18n/catalogs/${locale}.js`];
    if (load) await load();
    if (!isPagePublished(locale, path)) {
      window.location.replace(path + search + hash);
      return;
    }
  }
  applyDocumentLocale(locale);
  syncHead(window.location.pathname);
  const container = document.getElementById('root');
  const route = resolveRoute(path);
  // dist/index.html carries the prerendered landing page. When it is served for another path
  // (an SPA fallback), drop that markup so the right page mounts into an empty root.
  if (container.dataset.prerendered && container.dataset.prerendered !== route.key) {
    container.replaceChildren();
  }
  delete container.dataset.prerendered;
  const tree = (Page) => (
    <React.StrictMode>
      <LocaleProvider locale={locale} path={path}>
        <Page {...route.props} />
      </LocaleProvider>
    </React.StrictMode>
  );
  if (container.firstElementChild) {
    // Prerendered HTML is already on screen: load the page module first so React swaps in the
    // same markup instead of flashing the "Loading…" fallback.
    const mod = await loaders[route.key]();
    createRoot(container).render(tree(mod.default));
    return;
  }
  const Page = lazyPages[route.key];
  createRoot(container).render(
    <React.StrictMode>
      <LocaleProvider locale={locale} path={path}>
        <Suspense fallback={<Loading />}>
          <Page {...route.props} />
        </Suspense>
      </LocaleProvider>
    </React.StrictMode>
  );
}

boot();
