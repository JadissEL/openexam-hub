/**
 * Which locale URLs exist. A locale page is emitted only when its message catalog
 * and every content unit for that path are fresh. English always exists.
 * Blog posts use the hash map in blog-hashes.json (checked against the Markdown
 * in scripts/test-i18n.mjs and scripts/blog-data.mjs).
 */
import { ENABLED_LOCALES, localeMeta, DEFAULT_LOCALE } from './locales.js';
import { getUnitOverlay, messagesFresh, translate } from './runtime.js';
import { applyOverlay, unitFresh } from './overlay.js';
import { getEnglishUnit, metaUnitFor, unitsForPath } from './units.js';
import { isEnglishOnly, localizePath, normalizePath, prefixHref, splitLocale } from './paths.js';
import { routeMeta, SITE_ORIGIN } from '../seo/site.js';
import blogHashes from './blog-hashes.json' with { type: 'json' };

export function unitIsFresh(locale, unitId) {
  if (locale === DEFAULT_LOCALE) return true;
  const english = getEnglishUnit(unitId);
  if (!english) return false;
  return unitFresh(english, getUnitOverlay(locale, unitId));
}

/** English content with a fresh overlay applied. English, or a stale locale, returns the source. */
export function localizedUnit(locale, id) {
  const english = getEnglishUnit(id);
  if (!english || !locale || locale === DEFAULT_LOCALE) return english;
  if (!messagesFresh(locale)) return english;
  const overlay = getUnitOverlay(locale, id);
  if (!unitFresh(english, overlay)) return english;
  return applyOverlay(english, overlay.strings);
}

export function t(locale, key, vars) {
  return translate(locale || DEFAULT_LOCALE, key, vars);
}

export function blogPostFresh(locale, slug) {
  if (locale === DEFAULT_LOCALE) return true;
  const expected = blogHashes[slug];
  const overlay = getUnitOverlay(locale, `blog:${slug}`);
  if (!expected || !overlay) return false;
  return overlay.sourceHash === expected && overlay.complete === true;
}

export function isPagePublished(locale, path) {
  const p = normalizePath(path);
  if (locale === DEFAULT_LOCALE) return routeMeta(p) != null || p === '/blog' || /^\/blog\/[a-z0-9-]+$/.test(p);
  if (!ENABLED_LOCALES.includes(locale)) return false;
  if (isEnglishOnly(p)) return false;
  if (!messagesFresh(locale)) return false;
  const post = p.match(/^\/blog\/([a-z0-9-]+)$/);
  if (post) return blogPostFresh(locale, post[1]);
  if (p === '/blog') {
    if (!unitIsFresh(locale, 'site:blog')) return false;
    return Object.keys(blogHashes).some((slug) => blogPostFresh(locale, slug));
  }
  const ids = unitsForPath(p);
  if (!ids.length || !metaUnitFor(p)) return false;
  return ids.every((id) => unitIsFresh(locale, id));
}

/** Locales that have a fresh page at this English path, English first. */
export function publishedLocales(path) {
  const p = normalizePath(splitLocale(path).path);
  const out = [];
  if (isPagePublished(DEFAULT_LOCALE, p) || routeMeta(p) || p === '/blog' || /^\/blog\//.test(p)) out.push(DEFAULT_LOCALE);
  for (const locale of ENABLED_LOCALES) {
    if (locale !== DEFAULT_LOCALE && isPagePublished(locale, p)) out.push(locale);
  }
  return out;
}

export function absoluteUrl(pathname) {
  const p = normalizePath(pathname);
  if (p === '/') return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${p}`;
}

/** Reciprocal hreflang set for an English path. x-default is always the English URL. */
export function alternatesFor(path) {
  const p = normalizePath(splitLocale(path).path);
  const locales = publishedLocales(p);
  const links = locales.map((locale) => ({
    hreflang: localeMeta(locale).htmlLang,
    href: absoluteUrl(localizePath(locale, p))
  }));
  links.push({ hreflang: 'x-default', href: absoluteUrl(localizePath(DEFAULT_LOCALE, p)) });
  return links;
}

export function localizedRouteMeta(pathname, locale) {
  const split = splitLocale(pathname);
  const loc = locale || split.locale;
  const path = split.path;
  const meta = routeMeta(path);
  if (!meta) return null;
  if (loc !== DEFAULT_LOCALE && !isPagePublished(loc, path)) return null;
  let title = meta.title;
  let description = meta.description;
  if (loc !== DEFAULT_LOCALE) {
    const id = metaUnitFor(path);
    const overlay = id && getUnitOverlay(loc, id);
    if (overlay?.strings?.headTitle) title = overlay.strings.headTitle;
    if (overlay?.strings?.headDescription) description = overlay.strings.headDescription;
  }
  const canonical = absoluteUrl(localizePath(loc, path));
  const info = localeMeta(loc);
  const ogAlternates = publishedLocales(path)
    .filter((code) => code !== loc)
    .map((code) => localeMeta(code).ogLocale);
  return {
    title,
    description,
    canonical,
    lang: info.htmlLang,
    dir: info.dir,
    ogLocale: info.ogLocale,
    ogLocaleAlternates: ogAlternates,
    alternates: alternatesFor(path),
    fontHref: info.fontHref || null
  };
}

/** Internal link with the locale prefix when that translation is published. */
export function localizePublicHref(locale, href) {
  if (!href || locale === DEFAULT_LOCALE) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return href;
  let cut = href.length;
  const hash = href.indexOf('#');
  const query = href.indexOf('?');
  if (hash >= 0) cut = Math.min(cut, hash);
  if (query >= 0) cut = Math.min(cut, query);
  const path = normalizePath(href.slice(0, cut) || '/');
  const suffix = href.slice(cut);
  if (/\.[a-z0-9]{1,8}$/i.test(path)) return href;
  if (!isPagePublished(locale, path)) return prefixHref(DEFAULT_LOCALE, href);
  const localized = localizePath(locale, path);
  return `${localized}${suffix}`;
}

/** Head tags for one localized URL. Title and description fall back to the English page. */
export function localeHead(locale, path, title, description) {
  const split = splitLocale(path);
  const loc = locale || split.locale;
  const englishPath = split.path;
  const info = localeMeta(loc);
  let pageTitle = title;
  let pageDescription = description;
  if (loc !== DEFAULT_LOCALE) {
    const id = metaUnitFor(englishPath);
    const overlay = id && getUnitOverlay(loc, id);
    if (overlay?.strings?.headTitle) pageTitle = overlay.strings.headTitle;
    if (overlay?.strings?.headDescription) pageDescription = overlay.strings.headDescription;
  }
  return {
    title: pageTitle,
    description: pageDescription,
    canonical: absoluteUrl(localizePath(loc, englishPath)),
    lang: info.htmlLang,
    dir: info.dir,
    ogLocale: info.ogLocale,
    ogLocaleAlternates: publishedLocales(englishPath).filter((code) => code !== loc).map((code) => localeMeta(code).ogLocale),
    alternates: alternatesFor(englishPath),
    fontHref: info.fontHref || null
  };
}
