/**
 * Keep <head> in sync with the route in the browser. The prerendered HTML already carries the
 * right tags; this covers client-only paths (dev server, SPA fallback) so a JS-rendering crawler
 * never sees the home page's title or canonical on another URL.
 */
import { routeMeta } from './site.js';
import { splitLocale } from '../i18n/paths.js';
import { localizedRouteMeta } from '../i18n/publish.js';
import { applyDocumentLocale } from '../i18n/LocaleContext.jsx';

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el && value != null) el.setAttribute(attr, value);
}

function setRobots(content) {
  let el = document.head.querySelector('meta[name="robots"]');
  if (!content) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function syncAlternates(alternates, ogLocale, ogLocaleAlternates) {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  document.head.querySelectorAll('meta[property="og:locale"], meta[property="og:locale:alternate"]').forEach((el) => el.remove());
  for (const alt of alternates || []) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = alt.hreflang;
    link.href = alt.href;
    document.head.appendChild(link);
  }
  if (ogLocale) {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:locale');
    meta.setAttribute('content', ogLocale);
    document.head.appendChild(meta);
  }
  for (const value of ogLocaleAlternates || []) {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:locale:alternate');
    meta.setAttribute('content', value);
    document.head.appendChild(meta);
  }
}

/** Returns true when the path is a known, indexable non-blog route. */
export function syncHead(pathname) {
  const split = splitLocale(pathname);
  applyDocumentLocale(split.locale);
  if (split.path === '/blog' || split.path.startsWith('/blog/')) return true;
  const meta = localizedRouteMeta(pathname, split.locale) || (split.locale === 'en' ? routeMeta(split.path) : null);
  if (!meta) {
    // Unknown paths fall through to the study app with a 200 status. Keep them out of the index.
    setRobots('noindex, follow');
    return false;
  }
  setRobots(null);
  document.title = meta.title;
  setMeta('meta[name="description"]', 'content', meta.description);
  setMeta('link[rel="canonical"]', 'href', meta.canonical);
  setMeta('meta[property="og:url"]', 'content', meta.canonical);
  setMeta('meta[property="og:title"]', 'content', meta.title);
  setMeta('meta[property="og:description"]', 'content', meta.description);
  setMeta('meta[name="twitter:title"]', 'content', meta.title);
  setMeta('meta[name="twitter:description"]', 'content', meta.description);
  syncAlternates(meta.alternates, meta.ogLocale, meta.ogLocaleAlternates);
  return true;
}
