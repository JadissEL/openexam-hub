/**
 * In-memory catalogs. English messages are always loaded. Other locales are registered
 * at prerender time (Node reads the JSON) and in the browser (dynamic import of catalogs/).
 */
import enMessages from './messages/en.json' with { type: 'json' };
import { hashEntries } from './hash.js';
import { placeholders } from './overlay.js';

const catalogs = {
  en: { messages: enMessages, units: {} }
};

export function registerCatalog(locale, catalog) {
  catalogs[locale] = {
    messages: catalog.messages || {},
    units: catalog.units || {}
  };
}

export function hasCatalog(locale) {
  return locale === 'en' || Object.prototype.hasOwnProperty.call(catalogs, locale);
}

export function getMessages(locale) {
  return catalogs[locale]?.messages || enMessages;
}

export function getUnitOverlay(locale, unitId) {
  if (!locale || locale === 'en') return null;
  return catalogs[locale]?.units?.[unitId] || null;
}

export function messageHash(messages = enMessages) {
  const keys = Object.keys(messages).filter((k) => k !== '_sourceHash').sort();
  return hashEntries(keys.map((k) => ({ path: k, text: String(messages[k] ?? '') })));
}

export function messagesFresh(locale) {
  if (locale === 'en') return true;
  if (!hasCatalog(locale)) return false;
  const table = catalogs[locale].messages;
  if (!table || table._sourceHash !== messageHash(enMessages)) return false;
  const enKeys = Object.keys(enMessages).sort();
  const locKeys = Object.keys(table).filter((k) => k !== '_sourceHash').sort();
  if (enKeys.length !== locKeys.length) return false;
  for (let i = 0; i < enKeys.length; i++) {
    if (enKeys[i] !== locKeys[i]) return false;
    const a = placeholders(enMessages[enKeys[i]]).join(',');
    const b = placeholders(table[locKeys[i]]).join(',');
    if (a !== b) return false;
  }
  return true;
}

export function translate(locale, key, vars) {
  const table = getMessages(locale);
  let s = table[key];
  if (typeof s !== 'string' || (locale !== 'en' && !messagesFresh(locale))) s = enMessages[key];
  if (typeof s !== 'string') return key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) s = s.replaceAll(`{${name}}`, String(value));
  }
  return s;
}

/** Flatten per-file overlay JSON ({ id: { sourceHash, strings } }) into unit ids. */
export function unitsFromFiles(parts) {
  const units = {};
  for (const [prefix, data] of Object.entries(parts)) {
    if (!data || typeof data !== 'object') continue;
    for (const [id, entry] of Object.entries(data)) {
      units[`${prefix}:${id}`] = entry;
    }
  }
  return units;
}
