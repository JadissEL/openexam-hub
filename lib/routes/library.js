/**
 * GET /api/library?exam=TCF&level=B2&skill=listening -> {resources:[...]}
 * Read-only view of the shared, server-verified resource library (approved + reachable only).
 * exam is required; level and skill are optional filters.
 */
import { cors } from '../http.js';
import { findResources, resourcesCol, SKILLS } from '../library.js';
import { LEVELS } from '../agents/discovery.js';

const EXAM_PATTERN = /^[A-Z][A-Z0-9_-]{1,19}$/;
const iso = (t) => (t?.toDate ? t.toDate().toISOString() : typeof t === 'string' ? t : null);

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'Use GET.' });
    }
    const q = req.query || {};
    const exam = typeof q.exam === 'string' ? q.exam.trim().toUpperCase() : '';
    const level = typeof q.level === 'string' && q.level.trim() ? q.level.trim().toUpperCase() : null;
    const skill = typeof q.skill === 'string' && q.skill.trim() ? q.skill.trim().toLowerCase() : null;
    if (!EXAM_PATTERN.test(exam)) return res.status(400).json({ error: '"exam" is required (e.g. TCF, IELTS, GOETHE).' });
    if (level && !LEVELS.includes(level)) return res.status(400).json({ error: '"level" must be one of A1, A2, B1, B2, C1, C2.' });
    if (skill && !SKILLS.includes(skill)) return res.status(400).json({ error: `"skill" must be one of ${SKILLS.join(', ')}.` });

    let rows;
    if (level) {
      rows = await findResources({ exam, level, limit: 60 });
    } else {
      const snap = await resourcesCol()
        .where('exams', 'array-contains', exam)
        .where('approved', '==', true)
        .where('linkStatus', 'in', ['ok', 'unverified'])
        .limit(60)
        .get();
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const resources = rows
      .filter((r) => !skill || (r.skills || []).includes(skill))
      .map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        category: r.category,
        skills: r.skills || [],
        exams: r.exams || [],
        levels: r.levels || [],
        license: r.license,
        linkStatus: r.linkStatus,
        httpCode: r.httpCode ?? null,
        lastCheckedAt: iso(r.lastCheckedAt),
        usageCount: r.usageCount || 0
      }));
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ resources });
  } catch (err) {
    console.error('[library]', err);
    return res.status(500).json({ error: 'Could not read the resource library.' });
  }
}
