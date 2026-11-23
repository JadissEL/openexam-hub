#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = path.join(ROOT, 'docs/growth/free-backlink-targets-1000.csv');
const mdPath = path.join(ROOT, 'docs/growth/FREE_BACKLINK_TARGETS.md');
const catalogPath = path.join(ROOT, 'docs/growth/_directories_catalog.csv');

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = [];
    let cur = '';
    let q = false;
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (q && line[j + 1] === '"') {
          cur += '"';
          j++;
        } else q = !q;
      } else if (ch === ',' && !q) {
        cols.push(cur);
        cur = '';
      } else cur += ch;
    }
    cols.push(cur);
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    rows.push(obj);
  }
  return { header, rows };
}

function esc(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const { header, rows } = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const catalog = parseCsv(fs.readFileSync(catalogPath, 'utf8')).rows.filter((r) =>
  /^(free|freemium)$/i.test(String(r.pricing || '').trim())
);

const existingDomains = new Set(rows.map((r) => (r.domain || '').toLowerCase()).filter(Boolean));
const existingNames = new Set(rows.map((r) => (r.name || '').toLowerCase()));

const pool = [];
for (const r of catalog) {
  let domain = '';
  try {
    domain = new URL(r.url).hostname.replace(/^www\./, '');
  } catch {
    continue;
  }
  if (!domain) continue;
  if (existingDomains.has(domain)) continue;
  if (existingNames.has(String(r.name || '').toLowerCase())) continue;
  pool.push({
    name: String(r.name || domain).slice(0, 120),
    domain,
    url: r.url,
    category: r.category || 'startup_directory',
    pricing: r.pricing,
    link_type: r.link_type,
    dr: r.domain_rating,
  });
}

console.log('free/freemium unused catalog rows', pool.length);

let filled = 0;
let pi = 0;
for (let i = 0; i < rows.length; i++) {
  const isPlaceholder = rows[i].source === 'placeholder' || rows[i].category === 'research_queue';
  if (!isPlaceholder) continue;
  if (pi >= pool.length) break;
  const s = pool[pi++];
  rows[i] = {
    id: rows[i].id,
    priority: Number(s.dr) >= 50 ? 'P1' : 'P2',
    fit: 'medium',
    category: 'startup_directory',
    action: 'submit_listing',
    name: s.name,
    domain: s.domain,
    url_hint: s.url,
    cost: String(s.pricing || 'free').toLowerCase(),
    source: 'awesome_saas_catalog',
    status: 'todo',
    notes: `Catalog category=${s.category}; reported link=${s.link_type}; DR~${s.dr}. Verify free path and topical fit before submit.`,
  };
  existingDomains.add(s.domain);
  existingNames.add(s.name.toLowerCase());
  filled++;
}

const out = [header.join(',')]
  .concat(rows.map((r) => header.map((h) => esc(r[h])).join(',')))
  .join('\n');
fs.writeFileSync(csvPath, out);

const placeholders = rows.filter((r) => r.source === 'placeholder' || r.category === 'research_queue').length;
const real = rows.length - placeholders;
const priCounts = {};
const counts = {};
for (const r of rows) {
  priCounts[r.priority] = (priCounts[r.priority] || 0) + 1;
  counts[r.category] = (counts[r.category] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      total: rows.length,
      filled,
      real,
      placeholders,
      priCounts,
      topCategories: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    },
    null,
    2
  )
);

let md = fs.readFileSync(mdPath, 'utf8');
md = md.replace(/Named\/researched targets: \*\*\d+\*\*/, `Named/researched targets: **${real}**`);
md = md.replace(
  /Research placeholders still to fill: \*\*\d+\*\*/,
  `Research placeholders still to fill: **${placeholders}**`
);
md = md.replace(
  /- P0: \d+\n- P1: \d+\n- P2: \d+\n- P3: \d+/,
  ['P0', 'P1', 'P2', 'P3'].map((k) => `- ${k}: ${priCounts[k] || 0}`).join('\n')
);
const catBlock = Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n');
md = md.replace(/### By category\n([\s\S]*?)\n## File/, `### By category\n${catBlock}\n\n## File`);
fs.writeFileSync(mdPath, md);

// Keep catalog for reference but gitignore it? It's public data - can keep under docs/growth as source.
fs.writeFileSync(
  path.join(ROOT, 'docs/growth/README.md'),
  [
    '# Growth / free backlink outreach',
    '',
    '- `FREE_BACKLINK_TARGETS.md` — summary and rules',
    '- `free-backlink-targets-1000.csv` — master tracker (1000 rows)',
    '- `_directories_catalog.csv` — upstream free/freemium catalog snapshot (reference only)',
    '',
    'Regenerate:',
    '',
    '```bash',
    'node scripts/generate-free-backlink-targets.mjs',
    'node scripts/enrich-free-backlink-targets.mjs',
    '```',
    '',
  ].join('\n')
);
