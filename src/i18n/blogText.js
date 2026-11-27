/**
 * Translatable blog fields. Dates, exam ids, audience, draft, cover file and source URLs
 * stay on the English post and are not part of the hash.
 */
import { hashEntries } from './hash.js';

export function blogEntries(data = {}, body = '') {
  const out = [];
  const add = (path, text) => {
    if (text == null) return;
    const value = String(text).trim();
    if (!value) return;
    out.push({ path, text: value });
  };
  add('title', data.title);
  add('seoTitle', data.seoTitle);
  add('description', data.description);
  add('cover.alt', data.cover && data.cover.alt);
  add('cover.credit', data.cover && data.cover.credit);
  const faq = Array.isArray(data.faq) ? data.faq : [];
  faq.forEach((item, i) => {
    add(`faq[${i}].q`, item && item.q);
    add(`faq[${i}].a`, item && item.a);
  });
  const sources = Array.isArray(data.sources) ? data.sources : [];
  sources.forEach((item, i) => add(`sources[${i}].title`, item && item.title));
  add('body', body);
  return out;
}

export function blogSourceHashFrom(data, body) {
  return hashEntries(blogEntries(data, body));
}
