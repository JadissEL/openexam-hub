// POST /api/admin/import-resources — Authorization: Bearer ADMIN_SECRET or OEH_OPS_SECRET.
// Body: { items: [{ exam, title, url, category, skills[], levels[], license }], dryRun?: boolean }
// Server-side twin of `scripts/seed-library.js --from-candidates`: map exam ids, canonicalise and
// dedupe, run the copyright auditor (official-domain allowlist + live link check + paywall check),
// then upsert passing items as approved seeds and rebuild the affected shelves so the next plan
// build sees them. Rejected items are reported, never written.
import { readJsonBody, requireAnyBearer, sendJson } from '../../auth.js';
import { ConfigError } from '../../firebaseAdmin.js';
import { auditResources } from '../../agents/copyrightAuditor.js';
import { canonicalUrl, dedupKey } from '../../algo/keys.js';
import { mapExamIds } from '../../exams.js';
import { rebuildShelves, resourceId, resourcesCol, shelfKeysFor, upsertResource } from '../../library.js';

const MAX_ITEMS = 50;

export function prepareImport(raw) {
  const prepared = [];
  const dropped = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || typeof item.url !== 'string' || typeof item.title !== 'string') {
      dropped.push({ url: item?.url ?? null, reason: 'needs url and title strings' });
      continue;
    }
    const exams = mapExamIds(item.exam);
    if (!exams.length) {
      dropped.push({ url: item.url, reason: `unknown exam id "${item.exam}"` });
      continue;
    }
    let canon;
    try {
      canon = canonicalUrl(item.url);
    } catch {
      dropped.push({ url: item.url, reason: 'URL could not be canonicalised' });
      continue;
    }
    const dk = dedupKey(canon);
    if (seen.has(dk)) {
      dropped.push({ url: item.url, reason: 'duplicate within the batch' });
      continue;
    }
    seen.add(dk);
    prepared.push({
      exam: exams[0],
      exams,
      title: item.title.slice(0, 300),
      url: item.url,
      category: typeof item.category === 'string' ? item.category.slice(0, 80) : 'Study resource',
      skills: Array.isArray(item.skills) ? item.skills.filter((s) => typeof s === 'string') : [],
      levels: Array.isArray(item.levels) ? item.levels.filter((l) => typeof l === 'string') : [],
      license: typeof item.license === 'string' ? item.license.slice(0, 200) : undefined,
      dedupKey: dk
    });
  }
  return { prepared, dropped };
}

async function existingId(p) {
  const direct = await resourcesCol().doc(resourceId(p.url)).get();
  if (direct.exists) return direct.id;
  const hit = await resourcesCol().where('dedupKey', '==', p.dedupKey).limit(1).get();
  return hit.empty ? null : hit.docs[0].id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireAnyBearer(req, res, ['ADMIN_SECRET', 'OEH_OPS_SECRET'])) return;
  const body = await readJsonBody(req);
  if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > MAX_ITEMS) {
    return sendJson(res, 400, { error: `items must be an array of 1..${MAX_ITEMS} resources` });
  }
  try {
    const { prepared, dropped } = prepareImport(body.items);
    const { passed, rejected } = await auditResources(prepared);
    const results = [];
    const shelfKeys = new Set();
    for (const p of passed) {
      const exams = p.exams || [p.exam];
      // Rebuild every level shelf of each exam in the batch, not only the new tags: shelves built
      // before earlier imports would otherwise keep serving the old, shorter list.
      for (const k of shelfKeysFor(exams, [])) shelfKeys.add(k);
      const before = await existingId(p);
      if (before) {
        results.push({ url: p.url, exams, status: 'existing', id: before });
        continue;
      }
      if (body.dryRun) {
        results.push({ url: p.url, exams, status: 'would_add', linkStatus: p.linkStatus });
        continue;
      }
      const id = await upsertResource(
        { url: p.url, title: p.title, category: p.category, skills: p.skills, exams, levels: p.levels || [], license: p.license, linkStatus: p.linkStatus, httpCode: p.httpCode ?? null },
        { approved: true, addedBy: 'seed' }
      );
      results.push({ url: p.url, exams, status: 'added', id, linkStatus: p.linkStatus });
    }
    const shelvesRebuilt = body.dryRun ? [] : await rebuildShelves([...shelfKeys], { createMissing: true });
    return sendJson(res, 200, {
      dryRun: !!body.dryRun,
      added: results.filter((r) => r.status === 'added').length,
      existing: results.filter((r) => r.status === 'existing').length,
      results,
      rejected: rejected.map((r) => ({ url: r.url, reason: r.reason, httpCode: r.httpCode ?? null })),
      dropped,
      shelvesRebuilt
    });
  } catch (err) {
    if (err instanceof ConfigError) return sendJson(res, 503, { error: err.message });
    console.error('import-resources failed', err?.message);
    return sendJson(res, 500, { error: 'import failed' });
  }
}
