import { modeFromSearch } from '@hub/src/tools/clbContent.js';

export const TABS = [
  { id: 'home', label: 'Home', root: { name: 'home' } },
  { id: 'exams', label: 'Exams', root: { name: 'exams' } },
  { id: 'tools', label: 'Tools', root: { name: 'tools' } },
  { id: 'library', label: 'Library', root: { name: 'library' } },
  { id: 'study', label: 'Study', root: { name: 'planner' } }
];

export const TAB_ROOT = Object.fromEntries(TABS.map((t) => [t.id, t.root.name]));

export function tabOf(route) {
  switch (route?.name) {
    case 'home':
      return 'home';
    case 'exams':
    case 'exam':
    case 'plan':
      return 'exams';
    case 'tools':
    case 'clb':
    case 'cefr':
    case 'crs':
    case 'compare':
    case 'compareDetail':
      return 'tools';
    case 'library':
      return 'library';
    case 'planner':
    case 'roadmap':
    case 'account':
      return 'study';
    default:
      return 'home';
  }
}

/** Ads only on the signed-in study planner (the /app equivalent), never on guides, roadmaps, compare or tools. */
export function isAdRoute(route) {
  return route?.name === 'planner';
}

export function screenName(route) {
  if (!route) return 'home';
  if (route.name === 'exam') return `exam:${route.slug}`;
  if (route.name === 'plan') return `plan:${route.guide}/${route.slug}`;
  if (route.name === 'compareDetail') return `compare:${route.slug}`;
  if (route.name === 'clb') return `clb:${route.mode || 'tef'}`;
  if (route.name === 'roadmap') return 'roadmap';
  return route.name;
}

/**
 * Map an openexamhub.org URL onto an in-app route.
 * Returns { external } for pages the app opens in the browser (blog, funding, legal).
 */
export function routeFromUrl(raw) {
  let url;
  try {
    url = new URL(raw, 'https://openexamhub.org');
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'openexamhub.org' && host !== 'localhost') return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { name: 'home' };
  if (path === '/exams') return { name: 'exams' };
  let m = path.match(/^\/exams\/([a-z0-9-]+)$/);
  if (m) return { name: 'exam', slug: m[1] };
  m = path.match(/^\/exams\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (m) return { name: 'plan', guide: m[1], slug: m[2] };
  if (path === '/compare') return { name: 'compare' };
  m = path.match(/^\/compare\/([a-z0-9-]+)$/);
  if (m) return { name: 'compareDetail', slug: m[1] };
  if (path === '/tools' || path === '/tools/clb-converter') return { name: 'clb', mode: modeFromSearch(url.search) };
  if (path === '/tools/cefr-converter') return { name: 'cefr' };
  if (path === '/tools/crs-language-points') return { name: 'crs' };
  if (path === '/app' || path.startsWith('/app/')) {
    if (path === '/app/library') return { name: 'library' };
    if (path === '/app/plans') return { name: 'planner', focus: 'plans' };
    return { name: 'planner' };
  }
  if (path === '/privacy' || path === '/about' || path === '/faq' || path === '/funding' || path.startsWith('/blog')) {
    return { external: `https://openexamhub.org${path}${url.search}` };
  }
  return { name: 'home' };
}
