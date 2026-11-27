/**
 * Locales OpenExam Hub can publish. English stays at the unprefixed URLs.
 * A locale is emitted only when it is listed in ENABLED_LOCALES and every page
 * it claims has a fresh translation (see src/i18n/publish.js).
 *
 * dir is rtl for Arabic and Urdu only. fontHref is added to those pages' <head>
 * and is not loaded on LTR pages.
 */

export const LOCALES = {
  en: { code: 'en', htmlLang: 'en', dir: 'ltr', name: 'English', nativeName: 'English', ogLocale: 'en_US', dateLocale: 'en-GB' },
  fr: { code: 'fr', htmlLang: 'fr', dir: 'ltr', name: 'French', nativeName: 'Français', ogLocale: 'fr_FR', dateLocale: 'fr-FR' },
  ar: { code: 'ar', htmlLang: 'ar', dir: 'rtl', name: 'Arabic', nativeName: 'العربية', ogLocale: 'ar_AR', dateLocale: 'ar', fontHref: '/fonts/rtl.css' },
  vi: { code: 'vi', htmlLang: 'vi', dir: 'ltr', name: 'Vietnamese', nativeName: 'Tiếng Việt', ogLocale: 'vi_VN', dateLocale: 'vi-VN' },
  hi: { code: 'hi', htmlLang: 'hi', dir: 'ltr', name: 'Hindi', nativeName: 'हिन्दी', ogLocale: 'hi_IN', dateLocale: 'hi-IN' },
  bn: { code: 'bn', htmlLang: 'bn', dir: 'ltr', name: 'Bengali', nativeName: 'বাংলা', ogLocale: 'bn_BD', dateLocale: 'bn-BD' },
  ur: { code: 'ur', htmlLang: 'ur', dir: 'rtl', name: 'Urdu', nativeName: 'اردو', ogLocale: 'ur_PK', dateLocale: 'ur-PK', fontHref: '/fonts/rtl.css' },
  id: { code: 'id', htmlLang: 'id', dir: 'ltr', name: 'Indonesian', nativeName: 'Bahasa Indonesia', ogLocale: 'id_ID', dateLocale: 'id-ID' }
};

export const DEFAULT_LOCALE = 'en';

/**
 * Locales prerendered and listed in the sitemap. Empty until each locale's catalog
 * is complete: a listed locale with a stale page is a failed build, not a partial site.
 */
export const ENABLED_LOCALES = [];

export const LOCALE_CODES = Object.keys(LOCALES);

export function localeMeta(code) {
  return LOCALES[code] || LOCALES.en;
}

export function isKnownLocale(code) {
  return Object.prototype.hasOwnProperty.call(LOCALES, code);
}

/** Prefix used in URLs and in the visit-counter whitelist. English has none. */
export function localePrefixPattern() {
  return LOCALE_CODES.filter((c) => c !== 'en').join('|');
}
