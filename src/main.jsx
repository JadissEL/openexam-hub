import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { syncHead } from './seo/head.js';

// Tiny path router. The marketing pages ship without Firebase; the study app (App.jsx and the
// Firebase SDK) is code-split and only downloaded on /app.
const loaders = {
  landing: () => import('./landing/Landing.jsx'),
  legal: () => import('./landing/LegalPage.jsx'),
  info: () => import('./landing/InfoPage.jsx'),
  blog: () => import('./blog/BlogClient.jsx'),
  exams: () => import('./seo/ExamRoute.jsx'),
  app: () => import('./App.jsx')
};

function isBlogPath(p) {
  return p === '/blog' || p.startsWith('/blog/');
}

/** Which page module a path needs, and its props. */
function resolveRoute(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return { key: 'landing', props: {} };
  if (p === '/privacy') return { key: 'legal', props: { kind: 'privacy' } };
  if (p === '/terms') return { key: 'legal', props: { kind: 'terms' } };
  if (p === '/about') return { key: 'info', props: { kind: 'about' } };
  if (p === '/faq') return { key: 'info', props: { kind: 'faq' } };
  if (p === '/funding') return { key: 'info', props: { kind: 'funding' } };
  if (p === '/exams' || /^\/exams\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(p)) return { key: 'exams', props: { pathname: p } };
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

async function boot() {
  const pathname = window.location.pathname;
  syncHead(pathname);
  const container = document.getElementById('root');
  const route = resolveRoute(pathname);
  if (container.firstElementChild) {
    // Prerendered HTML is already on screen: load the page module first so React swaps in the
    // same markup instead of flashing the "Loading…" fallback.
    const mod = await loaders[route.key]();
    const Page = mod.default;
    createRoot(container).render(
      <React.StrictMode>
        <Page {...route.props} />
      </React.StrictMode>
    );
    return;
  }
  const Page = lazyPages[route.key];
  createRoot(container).render(
    <React.StrictMode>
      <Suspense fallback={<Loading />}>
        <Page {...route.props} />
      </Suspense>
    </React.StrictMode>
  );
}

boot();
