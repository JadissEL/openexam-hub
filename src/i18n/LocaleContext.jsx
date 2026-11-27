import React, { createContext, useContext } from 'react';
import { localeMeta } from './locales.js';
import { translate } from './runtime.js';
import { localizePublicHref, localizedUnit } from './publish.js';

const Ctx = createContext({ locale: 'en', path: '/' });

export function LocaleProvider({ locale = 'en', path = '/', children }) {
  return <Ctx.Provider value={{ locale, path }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}

export function useLocale() {
  return useContext(Ctx).locale || 'en';
}

export function usePathname() {
  return useContext(Ctx).path || '/';
}

export function useT() {
  const locale = useLocale();
  return (key, vars) => translate(locale, key, vars);
}

/** Localized content unit, or the English source when this locale has no fresh overlay. */
export function useUnit(id) {
  return localizedUnit(useLocale(), id);
}

export function useHref() {
  const locale = useLocale();
  return (href) => localizePublicHref(locale, href);
}

export function applyDocumentLocale(locale) {
  if (typeof document === 'undefined') return;
  const meta = localeMeta(locale);
  document.documentElement.lang = meta.htmlLang;
  document.documentElement.dir = meta.dir;
}
