/**
 * Check one locale's files without requiring it to be enabled.
 *   node scripts/check-locale.mjs fr
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unitIds, getEnglishUnit } from '../src/i18n/units.js';
import { numberTokens, placeholders, translatableEntries, unitFresh, urlTokens } from '../src/i18n/overlay.js';
import { messageHash, registerCatalog, unitsFromFiles } from '../src/i18n/runtime.js';
import { blogEntries, blogSourceHashFrom } from '../src/i18n/blogText.js';
import { CONTENT_DIR, REPO_ROOT, loadBlogPosts } from './blog-data.mjs';
import enMessages from '../src/i18n/messages/en.json' with { type: 'json' };

const locale = process.argv[2];
if (!locale) {
  console.error('usage: node scripts/check-locale.mjs <locale>');
  process.exit(1);
}

function bag(tokens) {
  const map = new Map();
  for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
  return map;
}
function sameBag(a, b) {
  const left = bag(a);
  const right = bag(b);
  if (left.size !== right.size) return false;
  for (const [key, count] of left) if (right.get(key) !== count) return false;
  return true;
}

const problems = [];
const messagesPath = path.join(REPO_ROOT, 'src/i18n/messages', `${locale}.json`);
if (!fs.existsSync(messagesPath)) problems.push('missing messages');
else {
  const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  if (messages._sourceHash !== messageHash(enMessages)) problems.push('message hash');
  const enKeys = Object.keys(enMessages).sort();
  const locKeys = Object.keys(messages).filter((k) => k !== '_sourceHash').sort();
  if (enKeys.join('\n') !== locKeys.join('\n')) problems.push(`message keys ${locKeys.length} vs ${enKeys.length}`);
  for (const key of enKeys) {
    if (typeof messages[key] !== 'string') continue;
    if (placeholders(enMessages[key]).join(',') !== placeholders(messages[key]).join(',')) problems.push(`placeholder ${key}`);
  }
}

const files = ['landing', 'site', 'exam', 'plan', 'compare', 'compareData', 'tool'];
const parts = {};
for (const name of files) {
  const file = path.join(REPO_ROOT, 'src/i18n/content', locale, `${name}.json`);
  if (!fs.existsSync(file)) {
    problems.push(`missing ${name}.json`);
    continue;
  }
  parts[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
}
const units = unitsFromFiles(parts);
let fresh = 0;
for (const id of unitIds()) {
  const english = getEnglishUnit(id);
  const overlay = units[id];
  if (!unitFresh(english, overlay)) {
    problems.push(`stale ${id}`);
    continue;
  }
  fresh += 1;
  for (const entry of translatableEntries(english)) {
    const translated = overlay.strings[entry.path];
    if (!sameBag(numberTokens(entry.text), numberTokens(translated))) problems.push(`numbers ${id} ${entry.path}`);
    if (!sameBag(urlTokens(entry.text), urlTokens(translated))) problems.push(`urls ${id} ${entry.path}`);
    if (placeholders(entry.text).join(',') !== placeholders(translated).join(',')) problems.push(`ph ${id} ${entry.path}`);
  }
}

let blogOk = 0;
for (const post of loadBlogPosts({ includeDrafts: true })) {
  if (post.draft) continue;
  const raw = fs.readFileSync(path.join(CONTENT_DIR, `${post.slug}.md`), 'utf8');
  const parsed = matter(raw);
  const body = String(parsed.content || '').trim();
  const hash = blogSourceHashFrom(parsed.data || {}, body);
  const file = path.join(REPO_ROOT, 'content/blog/i18n', locale, `${post.slug}.md`);
  if (!fs.existsSync(file)) {
    problems.push(`missing blog ${post.slug}`);
    continue;
  }
  const tr = matter(fs.readFileSync(file, 'utf8'));
  const trBody = String(tr.content || '').trim();
  if (tr.data?.sourceHash !== hash || tr.data?.translationOf !== post.slug || tr.data?.lang !== locale) {
    problems.push(`frontmatter ${post.slug}`);
    continue;
  }
  const source = blogEntries(parsed.data || {}, body);
  const translated = blogEntries(tr.data || {}, trBody);
  let bad = false;
  for (const entry of source) {
    const to = translated.find((item) => item.path === entry.path);
    if (!to) {
      problems.push(`blog field ${post.slug} ${entry.path}`);
      bad = true;
      continue;
    }
    if (!sameBag(numberTokens(entry.text), numberTokens(to.text))) {
      problems.push(`blog numbers ${post.slug} ${entry.path}`);
      bad = true;
    }
    if (!sameBag(urlTokens(entry.text), urlTokens(to.text))) {
      problems.push(`blog urls ${post.slug} ${entry.path}`);
      bad = true;
    }
  }
  if (!bad) blogOk += 1;
}

console.log(`${locale}: units ${fresh}/${unitIds().length}, blog ${blogOk}, problems ${problems.length}`);
for (const problem of problems.slice(0, 40)) console.log(' -', problem);
if (problems.length) process.exit(1);
