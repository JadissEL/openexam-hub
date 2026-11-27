/**
 * Read a locale catalog from disk for prerender and tests.
 * Missing files return null. A present but incomplete catalog is still returned;
 * publish.js decides which URLs are fresh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unitsFromFiles } from '../src/i18n/runtime.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILE_PREFIX = {
  landing: 'landing',
  site: 'site',
  exam: 'exam',
  plan: 'plan',
  compare: 'compare',
  compareData: 'compareData',
  tool: 'tool'
};

export function loadCatalog(locale) {
  const messagesPath = path.join(REPO_ROOT, 'src/i18n/messages', `${locale}.json`);
  if (!fs.existsSync(messagesPath)) return null;
  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  const units = {};
  const dir = path.join(REPO_ROOT, 'src/i18n/content', locale);
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const stem = file.replace(/\.json$/, '');
      const prefix = FILE_PREFIX[stem] || stem;
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      Object.assign(units, unitsFromFiles({ [prefix]: data }));
    }
  }
  const statusPath = path.join(REPO_ROOT, 'src/i18n/blog-status.json');
  if (fs.existsSync(statusPath)) {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    for (const [slug, hash] of Object.entries(status[locale] || {})) {
      units[`blog:${slug}`] = { sourceHash: hash, complete: true };
    }
  }
  return { messages, units };
}
