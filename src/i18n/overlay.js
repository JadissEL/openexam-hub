/**
 * Walk a plain English content value and collect the strings a translation may replace.
 * Numbers, dates, URLs, slugs and official exam-name tokens stay on the English object:
 * they are not entries, so a translation file cannot carry a second copy of them.
 */
import { hashEntries } from './hash.js';

const SKIP_KEYS = new Set([
  'url', 'href', 'src', 'path', 'slug', 'sourceUrl', 'imageUrl', 'canonical', 'csvPath',
  'date', 'updated', 'lastVerified', 'lastChecked', 'fetchedAt', 'id', 'exam', 'examIds',
  'tags', 'guide', 'key', 'price', 'priceCurrency', 'lang', 'draft', 'mode', 'tab',
  'operatingSystem', 'applicationCategory', 'browserRequirements', 'encodingFormat',
  'width', 'height', 'category', 'currency', 'kind', 'status', 'amount', 'amountEur', 'rate'
]);

/** Entire values that are official names or codes. Prose that merely contains them is still translated. */
const KEEP_EXACT = new Set([
  'IELTS', 'IELTS Academic', 'IELTS General Training', 'TOEFL', 'TOEFL iBT', 'TEF', 'TEF Canada',
  'TCF', 'TCF Canada', 'TCF tout public', 'CELPIP', 'CELPIP-General', 'DELF', 'DALF', 'Goethe',
  'Goethe-Zertifikat', 'telc', 'DELE', 'PTE', 'PTE Core', 'PTE Academic', 'Express Entry',
  'OpenExam Hub', 'IRCC', 'NCLC', 'CLB', 'CEFR', 'CRS', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2',
  'ETS', 'BAMF', 'DAAD', 'Ko-fi', 'PayPal', 'GitHub'
]);

function skipString(text) {
  const s = String(text);
  if (!s.trim()) return true;
  if (KEEP_EXACT.has(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^mailto:/i.test(s)) return true;
  if (/^\/(?!\/)/.test(s) && !/\s/.test(s)) return true;
  if (/^[A-Z][A-Z0-9_]{1,}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
  if (/^[\d\s.,:+%€$£–—-]+$/.test(s)) return true;
  return false;
}

export function translatableEntries(value, base = '', out = []) {
  if (typeof value === 'string') {
    if (!skipString(value)) out.push({ path: base, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => translatableEntries(item, `${base}[${i}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (SKIP_KEYS.has(key)) continue;
      const child = base ? `${base}.${key}` : key;
      translatableEntries(value[key], child, out);
    }
  }
  return out;
}

export function sourceHashOf(value) {
  return hashEntries(translatableEntries(value));
}

function parsePath(path) {
  const parts = [];
  const re = /([^[.\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path))) parts.push(m[1] !== undefined ? m[1] : Number(m[2]));
  return parts;
}

function setPath(root, path, text) {
  const parts = parsePath(path);
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur[parts[i]];
    if (cur == null) return;
  }
  const last = parts[parts.length - 1];
  if (cur != null && last !== undefined) cur[last] = text;
}

export function applyOverlay(english, strings) {
  const clone = structuredClone(english);
  if (!strings) return clone;
  for (const [path, text] of Object.entries(strings)) {
    if (typeof text === 'string') setPath(clone, path, text);
  }
  return clone;
}

/** True when every translatable leaf has a string and the recorded hash is still the English source. */
export function unitFresh(english, overlay) {
  if (!overlay || typeof overlay.sourceHash !== 'string' || !overlay.strings || typeof overlay.strings !== 'object') return false;
  const entries = translatableEntries(english);
  if (overlay.sourceHash !== hashEntries(entries)) return false;
  return entries.every((e) => typeof overlay.strings[e.path] === 'string');
}

const NUM_RE = /\d+(?:[.,]\d+)*/g;
const URL_RE = /https?:\/\/[^\s)\]>"']+/g;

export function numberTokens(text) {
  return String(text || '').match(NUM_RE) || [];
}

export function urlTokens(text) {
  return (String(text || '').match(URL_RE) || []).map((u) => u.replace(/[.,;]+$/, ''));
}

export function placeholders(text) {
  return (String(text || '').match(/\{[a-zA-Z0-9]+\}/g) || []).sort();
}
