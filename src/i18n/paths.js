/**
 * Locale prefixes and public paths. English is unprefixed. /app, /privacy and /terms
 * stay English: a locale URL for those paths is not a translation.
 */
import { DEFAULT_LOCALE, LOCALE_CODES, localePrefixPattern } from './locales.js';

export const ENGLISH_ONLY_PREFIXES = ['/app', '/privacy', '/terms'];

const PREFIX_RE = new RegExp(`^\\/(${localePrefixPattern()})(?=\\/|$)`);

export function normalizePath(pathname) {
  const raw = String(pathname || '/').split(/[?#]/)[0];
  if (raw === '/') return '/';
  return raw.replace(/\/+$/, '') || '/';
}

export function splitLocale(pathname) {
  const p = normalizePath(pathname);
  const m = p.match(PREFIX_RE);
  if (!m) return { locale: DEFAULT_LOCALE, path: p };
  const rest = p.slice(m[0].length);
  return { locale: m[1], path: rest === '' ? '/' : rest };
}

export function isEnglishOnly(path) {
  const p = normalizePath(path);
  return ENGLISH_ONLY_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function localizePath(locale, path) {
  const p = normalizePath(path);
  if (!locale || locale === DEFAULT_LOCALE || !LOCALE_CODES.includes(locale)) return p;
  if (isEnglishOnly(p)) return p;
  if (p === '/') return `/${locale}/`;
  return `/${locale}${p}`;
}

/** href with query and hash preserved. Does not check whether the locale page exists. */
export function prefixHref(locale, href) {
  if (!href || locale === DEFAULT_LOCALE) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return href;
  let cut = href.length;
  const hash = href.indexOf('#');
  const query = href.indexOf('?');
  if (hash >= 0) cut = Math.min(cut, hash);
  if (query >= 0) cut = Math.min(cut, query);
  const path = href.slice(0, cut) || '/';
  const suffix = href.slice(cut);
  if (/\.[a-z0-9]{1,8}$/i.test(normalizePath(path))) return href;
  const localized = localizePath(locale, path);
  if (localized === '/' && suffix.startsWith('#')) return `/${suffix}`;
  return `${localized}${suffix}`;
}
