/**
 * Dump English translation units and blog posts for translators.
 * Output is not committed. The English modules stay the source of truth.
 *
 *   node scripts/i18n-extract.mjs [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { unitIds, getEnglishUnit } from '../src/i18n/units.js';
import { sourceHashOf, translatableEntries } from '../src/i18n/overlay.js';
import { blogEntries, blogSourceHashFrom } from '../src/i18n/blogText.js';
import { messageHash } from '../src/i18n/runtime.js';
import { CONTENT_DIR, loadBlogPosts } from './blog-data.mjs';
import enMessages from '../src/i18n/messages/en.json' with { type: 'json' };

const outDir = path.resolve(process.argv[2] || '/tmp/i18n-src');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const groups = {};
for (const id of unitIds()) {
  const prefix = id.slice(0, id.indexOf(':'));
  const key = id.slice(prefix.length + 1);
  const english = getEnglishUnit(id);
  const strings = {};
  for (const entry of translatableEntries(english)) strings[entry.path] = entry.text;
  (groups[prefix] ||= {})[key] = { sourceHash: sourceHashOf(english), strings };
}
for (const [prefix, data] of Object.entries(groups)) {
  fs.writeFileSync(path.join(outDir, `${prefix}.json`), JSON.stringify(data, null, 2) + '\n');
}

const messages = { _sourceHash: messageHash(enMessages), ...enMessages };
fs.writeFileSync(path.join(outDir, 'messages.json'), JSON.stringify(messages, null, 2) + '\n');

const blogDir = path.join(outDir, 'blog');
fs.mkdirSync(blogDir, { recursive: true });
const hashes = {};
for (const post of loadBlogPosts({ includeDrafts: true })) {
  if (post.draft) continue;
  const raw = fs.readFileSync(path.join(CONTENT_DIR, `${post.slug}.md`), 'utf8');
  const parsed = matter(raw);
  const body = String(parsed.content || '').trim();
  const data = parsed.data || {};
  hashes[post.slug] = blogSourceHashFrom(data, body);
  const strings = {};
  for (const entry of blogEntries(data, body)) strings[entry.path] = entry.text;
  fs.writeFileSync(path.join(blogDir, `${post.slug}.json`), JSON.stringify({
    slug: post.slug,
    sourceHash: hashes[post.slug],
    strings
  }, null, 2) + '\n');
}
fs.writeFileSync(path.join(outDir, 'blog-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
console.log(`extracted ${unitIds().length} units and ${Object.keys(hashes).length} posts to ${outDir}`);
