// Single source of truth for which domains count as "official".
// Built-in domains. Keep in sync with OFFICIAL_DOMAIN_ALLOWLIST in App.jsx.
export const BASE_DOMAIN_ALLOWLIST = [
  'france-education-international.fr',
  'tv5monde.com',
  'rfi.fr',
  'britishcouncil.org',
  'ielts.org',
  'cambridgeenglish.org',
  'goethe.de',
  'dw.com',
  'vhs-lernportal.de',
  'europa.eu',
  'lefrancaisdesaffaires.fr',
  'canada.ca',
  'ets.org',
  'cervantes.es',
  'cervantes.org',
  'testdaf.de',
  'telc.net',
  'ambafrance-ca.org',
  'celpip.ca',
  'paragontesting.ca',
  // Multi-tenant exceptions: official exam-board videos (e.g. @CELPIPOfficial).
  // youtu.be must be listed so redirects from short links stay on the allowlist.
  'youtube.com',
  'youtu.be'
];

/**
 * EXTRA_ALLOWED_DOMAINS: comma-separated registrable domains of exam boards added by the
 * expansion workflow (e.g. "cervantes.es,dele.org,testdaf.de,celpip.ca"). Each entry must be a
 * bare hostname (no scheme, path, port or wildcard) with at least one dot; invalid entries are
 * ignored with a warning. Subdomains are allowed automatically, exactly like the built-ins.
 * Do not add multi-tenant hosts (e.g. github.io, blogspot.com) or public suffixes (co.uk).
 */
export function parseExtraDomains(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const out = [];
  for (const part of raw.split(',')) {
    const d = part.trim().toLowerCase().replace(/\.$/, '');
    if (!d) continue;
    if (/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(d)) {
      if (!out.includes(d)) out.push(d);
    } else {
      console.warn(`EXTRA_ALLOWED_DOMAINS: ignoring invalid entry "${part.trim()}"`);
    }
  }
  return out;
}

export const EXTRA_ALLOWED_DOMAINS = parseExtraDomains(process.env.EXTRA_ALLOWED_DOMAINS);

// Same export name and shape as before: built-ins first, then env extras.
export const OFFICIAL_DOMAIN_ALLOWLIST = [
  ...BASE_DOMAIN_ALLOWLIST,
  ...EXTRA_ALLOWED_DOMAINS.filter((d) => !BASE_DOMAIN_ALLOWLIST.includes(d))
];

/** Strict check: https only, hostname equal to or a subdomain of an allowlisted domain. */
export function isOfficialUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  return OFFICIAL_DOMAIN_ALLOWLIST.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Canonical form used as the library key (drops hash, trailing slash, tracking params). */
export function normalizeUrl(raw) {
  const u = new URL(raw);
  u.hash = '';
  for (const p of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|feature|cbrd|ucbcb)/i.test(p)) u.searchParams.delete(p);
  }
  u.hostname = u.hostname.toLowerCase();
  let s = u.toString();
  if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
  return s;
}
