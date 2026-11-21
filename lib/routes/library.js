/**
 * GET /api/library?exam=TCF&level=B2&skill=listening -> {resources:[...], shelfVersion?}
 * Read-only view of the shared, server-verified resource library (approved + reachable only).
 * exam is required; level and skill are optional filters.
 *
 * With a level it is served from the ranked shelf (shelves/{EXAM}_{LEVEL}: one doc read, LRU-cached
 * per instance, CDN-cached 10 min); `skill` uses the shelf's pre-ranked bySkill list. Without a
 * level, or when the shelf cannot be read, it falls back to the direct library query.
 */
import { cors } from '../http.js';
import { findResources, getShelf, resourcesCol, SKILLS, LIVE_STATUSES } from '../library.js';
import { LEVELS } from '../agents/discovery.js';
import { resolvePlannerExam, preferVariantResources, withOfficialSource } from '../exams.js';

const EXAM_PATTERN = /^[A-Z][A-Z0-9_-]{1,19}$/;
const iso = (t) => (t?.toDate ? t.toDate().toISOString() : typeof t === 'string' ? t : t instanceof Date ? t.toISOString() : null);

const view = (r, exam) => ({
  id: r.id,
  title: r.title,
  url: r.url,
  category: r.category,
  skills: r.skills || [],
  exams: r.exams || [exam],
  levels: r.levels || [],
  license: r.license,
  linkStatus: r.linkStatus,
  httpCode: r.httpCode ?? null,
  lastCheckedAt: iso(r.lastCheckedAt),
  usageCount: r.usageCount || 0,
  ...(typeof r.rank === 'number' ? { rank: r.rank } : {}),
  ...(typeof r.relevance === 'number' ? { relevance: r.relevance } : {})
});

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'Use GET.' });
    }
    const q = req.query || {};
    const examRaw = typeof q.exam === 'string' ? q.exam.trim().toUpperCase() : '';
    const variantRaw = typeof q.variant === 'string' && q.variant.trim() ? q.variant.trim() : null;
    const resolved = resolvePlannerExam(examRaw, variantRaw);
    const exam = resolved.exam;
    const variant = resolved.variant;
    const level = typeof q.level === 'string' && q.level.trim() ? q.level.trim().toUpperCase() : null;
    const skill = typeof q.skill === 'string' && q.skill.trim() ? q.skill.trim().toLowerCase() : null;
    if (!EXAM_PATTERN.test(examRaw) || !EXAM_PATTERN.test(exam)) return res.status(400).json({ error: '"exam" is required (e.g. TCF, IELTS, GOETHE).' });
    if (level && !LEVELS.includes(level)) return res.status(400).json({ error: '"level" must be one of A1, A2, B1, B2, C1, C2.' });
    if (skill && !SKILLS.includes(skill)) return res.status(400).json({ error: `"skill" must be one of ${SKILLS.join(', ')}.` });

    let rows = null;
    let shelfVersion = null;
    if (level) {
      try {
        const shelf = await getShelf(exam, level);
        shelfVersion = typeof shelf.version === 'number' ? shelf.version : null;
        const entries = shelf.entries || [];
        if (skill && Array.isArray(shelf.bySkill?.[skill])) {
          const byId = new Map(entries.map((e) => [e.id, e]));
          rows = shelf.bySkill[skill].map((id) => byId.get(id)).filter(Boolean);
        } else {
          rows = entries;
        }
      } catch (err) {
        console.warn('[library] shelf unavailable, falling back to the direct query:', err?.message);
        rows = await findResources({ exam, level, limit: 60 });
      }
    } else {
      const snap = await resourcesCol()
        .where('exams', 'array-contains', exam)
        .where('approved', '==', true)
        .where('linkStatus', 'in', LIVE_STATUSES)
        .limit(60)
        .get();
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    let resources = rows.filter((r) => !skill || (r.skills || []).includes(skill)).map((r) => view(r, exam));
    if (variant) resources = withOfficialSource(preferVariantResources(resources, exam, variant), exam, variant, level);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    if (shelfVersion != null) res.setHeader('ETag', `W/"shelf-${exam}-${level}-${shelfVersion}"`);
    return res.status(200).json({ resources, ...(shelfVersion != null ? { shelfVersion } : {}) });
  } catch (err) {
    console.error('[library]', err);
    return res.status(500).json({ error: 'Could not read the resource library.' });
  }
}
