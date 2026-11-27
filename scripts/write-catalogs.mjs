/**
 * Rebuild blog-status.json and src/i18n/catalogs/<locale>.js from translation files
 * whose sourceHash still matches English. Does not enable a locale by itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { REPO_ROOT, CONTENT_DIR } from './blog-data.mjs';
import { blogSourceHashFrom } from '../src/i18n/blogText.js';
import { ENABLED_LOCALES, LOCALE_CODES } from '../src/i18n/locales.js';

const hashes = {};
for (const file of fs.readdirSync(CONTENT_DIR)) {
  if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') continue;
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  const parsed = matter(raw);
  if (parsed.data?.draft === true) continue;
  hashes[file.replace(/\.md$/, '')] = blogSourceHashFrom(parsed.data || {}, String(parsed.content || '').trim());
}
fs.writeFileSync(path.join(REPO_ROOT, 'src/i18n/blog-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');

const status = {};
const i18nRoot = path.join(REPO_ROOT, 'content/blog/i18n');
for (const locale of LOCALE_CODES) {
  if (locale === 'en') continue;
  const dir = path.join(i18nRoot, locale);
  if (!fs.existsSync(dir)) continue;
  const fresh = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const parsed = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (parsed.data?.sourceHash === hashes[slug] && parsed.data?.translationOf === slug) fresh[slug] = hashes[slug];
  }
  if (Object.keys(fresh).length) status[locale] = fresh;
}
fs.writeFileSync(path.join(REPO_ROOT, 'src/i18n/blog-status.json'), JSON.stringify(status, null, 2) + '\n');

const catalogDir = path.join(REPO_ROOT, 'src/i18n/catalogs');
fs.mkdirSync(catalogDir, { recursive: true });
const files = ['landing', 'site', 'exam', 'plan', 'compare', 'compareData', 'tool'];
for (const locale of ENABLED_LOCALES) {
  const lines = [
    `import messages from '../messages/${locale}.json' with { type: 'json' };`,
    ...files.map((name) => `import ${name} from '../content/${locale}/${name}.json' with { type: 'json' };`),
    `import status from '../blog-status.json' with { type: 'json' };`,
    `import { registerCatalog, unitsFromFiles } from '../runtime.js';`,
    ``,
    `const units = unitsFromFiles({ ${files.join(', ')} });`,
    `for (const [slug, hash] of Object.entries(status.${locale} || {})) {`,
    `  units[\`blog:\${slug}\`] = { sourceHash: hash, complete: true };`,
    `}`,
    `registerCatalog('${locale}', { messages, units });`,
    ``
  ];
  fs.writeFileSync(path.join(catalogDir, `${locale}.js`), lines.join('\n'));
}
console.log('catalogs', ENABLED_LOCALES.join(',') || '(none enabled)', 'blog locales', Object.keys(status).join(',') || '(none)');
