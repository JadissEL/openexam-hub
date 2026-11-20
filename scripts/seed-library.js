#!/usr/bin/env node
/**
 * Seed the shared resource library with curated official resources.
 *
 * Every URL is canonicalised and deduped (lib/algo/keys.js), then goes through
 * the copyright auditor (allowlist + real link check + paywall check) before it
 * is written with addedBy:'seed', approved:true, via upsertResource (v3 fields;
 * v3 ids when RESOURCE_IDS_V3=1). Failures are reported, never written.
 *
 * Usage:
 *   node scripts/seed-library.js --dry-run
 *       Audit the original 9 seeds only (no credentials needed).
 *   node scripts/seed-library.js --from-candidates --dry-run
 *       Audit the 81 approved curator resources (plus report drops vs the 9 seeds).
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_PROJECT_ID=demo-openexam \
 *     APP_ID=openexam-hub RESOURCE_IDS_V3=1 \
 *     node scripts/seed-library.js --from-candidates --emulator
 *       Write to the demo-openexam emulator only.
 *   RESOURCE_IDS_V3=1 APP_ID=openexam-hub FIREBASE_SERVICE_ACCOUNT='...' \
 *     node scripts/seed-library.js --from-candidates --prod
 *       Production write. Refused unless --prod is set explicitly, the project
 *       id does not start with demo-, and the emulator host is unset. Run this
 *       only after Jadiss OKs the rules/index deploy.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditResources } from '../lib/agents/copyrightAuditor.js';
import { canonicalUrl, dedupKey, resourceIdFor } from '../lib/algo/keys.js';
import { mapExamIds } from '../lib/exams.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CANDIDATES = resolve(HERE, 'seed-candidates.json');

export const SEED = [
  ['TCF', 'France Éducation international TCF page', 'https://www.france-education-international.fr/test/tcf-tout-public', 'Official exam info', ['exam_format', 'mock_exam']],
  ['TCF', 'TV5Monde Apprendre le français', 'https://apprendre.tv5monde.com/fr', 'Listening & grammar', ['listening', 'grammar', 'reading']],
  ['TCF', 'RFI Français facile', 'https://francaisfacile.rfi.fr/fr/', 'Oral comprehension', ['listening']],
  ['IELTS', 'IELTS official', 'https://ielts.org', 'Official exam info', ['exam_format']],
  ['IELTS', 'British Council TakeIELTS', 'https://takeielts.britishcouncil.org', 'Practice tests', ['mock_exam', 'reading', 'listening', 'writing']],
  ['IELTS', 'Cambridge English IELTS', 'https://www.cambridgeenglish.org', 'Sample tests', ['mock_exam']],
  ['GOETHE', 'Goethe-Institut exams', 'https://www.goethe.de/de/spr/prf.html', 'Official exam info', ['exam_format', 'mock_exam']],
  ['GOETHE', 'DW Learn German', 'https://learngerman.dw.com', 'Listening & grammar', ['listening', 'grammar', 'vocabulary']],
  ['GOETHE', 'VHS Lernportal', 'https://www.vhs-lernportal.de', 'Self-study', ['reading', 'writing', 'grammar']]
].map(([exam, title, url, category, skills]) => ({ exam, title, url, category, skills, levels: [], exams: [exam] }));

const arg = (name) => process.argv.includes(name);
const argValue = (name, fallback) => {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  if (!next || next.startsWith('-')) return fallback;
  return next;
};

function safeCanonical(url) {
  try {
    return canonicalUrl(url);
  } catch {
    return null;
  }
}

function stamp(item, exams) {
  const url = safeCanonical(item.url);
  const primary = exams[0];
  return {
    ...item,
    originalUrl: item.url,
    url: item.url,
    exam: primary,
    exams,
    canonicalUrl: url,
    dedupKey: url ? dedupKey(url) : null,
    v3Id: url ? resourceIdFor(url) : null,
    levels: Array.isArray(item.levels) ? item.levels : [],
    skills: Array.isArray(item.skills) ? item.skills : [],
    category: item.category || 'Study resource',
    title: item.title
  };
}

/** Map, canonicalise and dedupe curator candidates against the original 9 seeds. */
export function prepareCandidates(raw, seeds = SEED) {
  const dropped = [];
  const prepared = [];
  const seedByCanon = new Map();
  const seedByDedup = new Map();
  for (const s of seeds) {
    const row = stamp(s, s.exams || [s.exam]);
    if (row.canonicalUrl) seedByCanon.set(row.canonicalUrl, row);
    if (row.dedupKey) seedByDedup.set(row.dedupKey, row);
  }
  const seenCanon = new Set();
  const seenDedup = new Set();
  for (const item of raw || []) {
    const exams = mapExamIds(item.exam);
    if (!exams.length) {
      dropped.push({ url: item.url, title: item.title, reason: `unknown exam id "${item.exam}"` });
      continue;
    }
    const row = stamp(item, exams);
    if (!row.canonicalUrl) {
      dropped.push({ url: item.url, title: item.title, reason: 'URL could not be canonicalised' });
      continue;
    }
    if (seedByCanon.has(row.canonicalUrl) || seedByDedup.has(row.dedupKey)) {
      const hit = seedByCanon.get(row.canonicalUrl) || seedByDedup.get(row.dedupKey);
      dropped.push({ url: item.url, title: item.title, reason: `duplicate of existing seed ${hit.url}` });
      continue;
    }
    if (seenCanon.has(row.canonicalUrl) || seenDedup.has(row.dedupKey)) {
      dropped.push({ url: item.url, title: item.title, reason: 'duplicate within the candidate list' });
      continue;
    }
    seenCanon.add(row.canonicalUrl);
    seenDedup.add(row.dedupKey);
    prepared.push(row);
  }
  return { prepared, dropped, seedCount: seeds.length };
}

function assertSafeWriteTarget() {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
  if (arg('--emulator')) {
    if (!emulator) {
      throw new Error('Refusing to write: --emulator requires FIRESTORE_EMULATOR_HOST (demo-openexam only).');
    }
    if (project && !project.startsWith('demo-')) {
      throw new Error(`Refusing to write: --emulator project must start with demo- (got ${project}).`);
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Credentials plus emulator is usually fine (admin talks to the emulator),
      // but never let a prod project id sneak through.
      try {
        const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (creds.project_id && !String(creds.project_id).startsWith('demo-') && !project.startsWith('demo-')) {
          throw new Error(`Refusing to write: service account project ${creds.project_id} is not a demo- project.`);
        }
      } catch (err) {
        if (/Refusing to write/.test(err.message)) throw err;
      }
    }
    return 'emulator';
  }
  if (arg('--prod')) {
    if (emulator) {
      throw new Error('Refusing --prod while FIRESTORE_EMULATOR_HOST is set. Unset it to write to production.');
    }
    if (project.startsWith('demo-')) {
      throw new Error('Refusing --prod against a demo- project id.');
    }
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('Refusing --prod: FIREBASE_SERVICE_ACCOUNT is missing.');
    }
    return 'prod';
  }
  // Implicit emulator (npm run e2e and local runs): write only when the
  // emulator host is set and the project is demo-.
  if (emulator) {
    if (project && !project.startsWith('demo-')) {
      throw new Error(`Refusing to write: FIRESTORE_EMULATOR_HOST is set but project ${project} is not a demo- project.`);
    }
    return 'emulator';
  }
  throw new Error('Refusing to write: pass --dry-run, or --emulator (demo-openexam), or --prod.');
}

async function writePassed(passed) {
  process.env.RESOURCE_IDS_V3 = process.env.RESOURCE_IDS_V3 || '1';
  const { upsertResource } = await import('../lib/library.js');
  let written = 0;
  const failures = [];
  for (const p of passed) {
    try {
      const id = await upsertResource(
        {
          url: p.url,
          title: p.title,
          category: p.category,
          skills: p.skills,
          exams: p.exams || [p.exam],
          levels: p.levels || [],
          license: p.license,
          linkStatus: p.linkStatus,
          httpCode: p.httpCode ?? null
        },
        { approved: true, addedBy: 'seed' }
      );
      written++;
      console.log(`  WROTE ${id} ${p.url} [${p.linkStatus} ${p.httpCode ?? ''}] exams=${(p.exams || [p.exam]).join(',')}`);
    } catch (err) {
      failures.push({ url: p.url, reason: err?.message || String(err) });
      console.log(`  FAILED to write ${p.url}: ${err?.message || err}`);
    }
  }
  return { written, failures };
}

function printDropped(dropped) {
  if (!dropped.length) return;
  console.log(`Dropped ${dropped.length} candidate(s) before the HTTP audit:`);
  for (const d of dropped) console.log(`  DROP ${d.url} — ${d.reason}`);
}

async function main() {
  const dryRun = arg('--dry-run');
  const fromCandidates = arg('--from-candidates');
  const candidatesPath = argValue('--from-candidates', DEFAULT_CANDIDATES);
  let items = SEED;
  let dropped = [];
  if (fromCandidates) {
    const raw = JSON.parse(readFileSync(candidatesPath, 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`${candidatesPath} must be a JSON array`);
    const prep = prepareCandidates(raw, SEED);
    dropped = prep.dropped;
    items = prep.prepared;
    console.log(`Prepared ${items.length} of ${raw.length} curator resources (${dropped.length} dropped vs seeds/invalid/dupes).`);
    printDropped(dropped);
  }
  console.log(`Auditing ${items.length} resource(s)${dryRun ? ' (dry run)' : ''}...`);
  const { passed, rejected } = await auditResources(items);
  for (const r of rejected) console.log(`  REJECTED ${r.url} — ${r.reason}${r.httpCode ? ` (HTTP ${r.httpCode})` : ''}`);
  if (dryRun) {
    for (const p of passed) {
      const id = p.v3Id || (p.url && resourceIdFor(p.url));
      console.log(`  PASS ${id || ''} ${p.url} [${p.linkStatus} ${p.httpCode ?? ''}] ${p.license}${p.contentChecked ? '' : ' (content not inspected)'} exams=${(p.exams || [p.exam]).join(',')}`);
    }
    console.log(`Dry run: ${passed.length} would be written, ${rejected.length} rejected at audit, ${dropped.length} dropped before audit.`);
    return rejected.length ? 2 : 0;
  }
  const target = assertSafeWriteTarget();
  console.log(`Writing to ${target}${target === 'emulator' ? ` (${process.env.FIRESTORE_EMULATOR_HOST}, project ${process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-openexam'})` : ''} with RESOURCE_IDS_V3=${process.env.RESOURCE_IDS_V3 || '1'}.`);
  const { written, failures } = await writePassed(passed);
  console.log(`Done: ${written} written, ${rejected.length} rejected at audit, ${dropped.length} dropped before audit, ${failures.length} write failure(s).`);
  return written === items.length ? 0 : 2;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('Seed failed:', err?.message || err);
      process.exit(1);
    }
  );
}
