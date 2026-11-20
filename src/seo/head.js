/**
 * Keep <head> in sync with the route in the browser. The prerendered HTML already carries the
 * right tags; this covers client-only paths (dev server, SPA fallback) so a JS-rendering crawler
 * never sees the home page's title or canonical on another URL.
 */
import { routeMeta, normalizePath } from './site.js';

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
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

/** Returns true when the path is a known, indexable non-blog route. */
export function syncHead(pathname) {
  const p = normalizePath(pathname);
  if (p === '/blog' || p.startsWith('/blog/')) return true; // the blog manages its own head
  const meta = routeMeta(p);
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
  return true;
}
