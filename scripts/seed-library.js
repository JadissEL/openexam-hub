#!/usr/bin/env node
/**
 * Seed the shared resource library with curated official resources.
 *
 * Every URL goes through the copyright auditor (allowlist + real link check + paywall check)
 * before it is written with addedBy:'seed', approved:true. Failures are reported, never written.
 * Levels are left empty (= all levels).
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' APP_ID=openexam-hub node scripts/seed-library.js
 *   node scripts/seed-library.js --dry-run     # audit only, no Firestore writes (no credentials needed)
 */
import { auditResources } from '../lib/agents/copyrightAuditor.js';

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
].map(([exam, title, url, category, skills]) => ({ exam, title, url, category, skills, levels: [] }));

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Auditing ${SEED.length} seed resources${dryRun ? ' (dry run)' : ''}...`);
  const { passed, rejected } = await auditResources(SEED);
  for (const r of rejected) console.log(`  REJECTED ${r.url} — ${r.reason}`);
  if (dryRun) {
    for (const p of passed) console.log(`  PASS ${p.url} [${p.linkStatus} ${p.httpCode ?? ''}] ${p.license}${p.contentChecked ? '' : ' (content not inspected)'}`);
    console.log(`Dry run: ${passed.length} would be written, ${rejected.length} rejected.`);
    return rejected.length ? 2 : 0;
  }
  const { saveToLibrary } = await import('../lib/orchestrator.js');
  let written = 0;
  for (const p of passed) {
    try {
      // Curated titles are kept (pageTitle is only a hint for LLM-discovered items).
      const id = await saveToLibrary(p, { exam: p.exam, approved: true, addedBy: 'seed' });
      written++;
      console.log(`  WROTE ${id} ${p.url} [${p.linkStatus} ${p.httpCode ?? ''}]`);
    } catch (err) {
      console.log(`  FAILED to write ${p.url}: ${err?.message || err}`);
    }
  }
  console.log(`Done: ${written} written, ${rejected.length} rejected, ${passed.length - written} write failure(s).`);
  return written === SEED.length ? 0 : 2;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('Seed failed:', err?.message || err);
    process.exit(1);
  }
);
