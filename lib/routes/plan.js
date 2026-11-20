/**
 * GET /api/plan?exam=TCF&level=B2&days=28[&profile=w--s--] -> {roadmap} | 404
 *
 * CDN-cacheable lookup of the shared plan cache (plans/{planKey}). The schedule is rebuilt for the
 * EXACT `days` from the cached ranked resources + wording, so popular plans never reach the
 * generator. `profile` is the quantised diagnostic band (6 chars of w/m/s/-, lib/algo/keys.js
 * quantiseProfile). On a miss the client POSTs /api/generate-roadmap.
 */
import { cors } from '../http.js';
import { pub } from '../firebaseAdmin.js';
import { planKey, profileToScores } from '../algo/keys.js';
import { LEVELS } from '../algo/common.js';
import { createLru } from '../algo/lru.js';
import { usablePlan, assembleFromPlan, roadmapFrom } from '../plans.js';

const EXAM_PATTERN = /^[A-Z][A-Z0-9_-]{1,19}$/;
const PROFILE_PATTERN = /^[wms-]{6}$/;
const lru = createLru({ max: 300, ttlMs: 600000 });

export default async function handler(req, res) {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      return res.status(405).json({ error: 'Use GET.' });
    }
    const q = req.query || {};
    const exam = typeof q.exam === 'string' ? q.exam.trim().toUpperCase() : '';
    const level = typeof q.level === 'string' ? q.level.trim().toUpperCase() : '';
    const days = typeof q.days === 'string' && /^\d{1,3}$/.test(q.days.trim()) ? Number(q.days) : NaN;
    const profile = typeof q.profile === 'string' && q.profile ? q.profile.trim() : null;
    if (!EXAM_PATTERN.test(exam)) return res.status(400).json({ error: '"exam" is required (e.g. TCF, IELTS, GOETHE).' });
    if (!LEVELS.includes(level)) return res.status(400).json({ error: '"level" must be one of A1, A2, B1, B2, C1, C2.' });
    if (!Number.isInteger(days) || days < 1 || days > 180) return res.status(400).json({ error: '"days" must be a whole number from 1 to 180.' });
    if (profile && (!PROFILE_PATTERN.test(profile) || profile === '------')) return res.status(400).json({ error: '"profile" must be 6 characters of w, m, s or -.' });

    const skillScores = profile ? profileToScores(profile) : null;
    const key = planKey({ exam, level, days, skillScores });
    let doc = lru.get(key);
    if (!doc) {
      const snap = await pub().collection('plans').doc(key).get();
      doc = snap.exists ? snap.data() : null;
      if (usablePlan(doc, { requirePolish: false })) lru.set(key, doc);
    }
    if (!usablePlan(doc, { requirePolish: false })) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'No shared plan yet for this exam, level and duration.', planKey: key });
    }
    const a = assembleFromPlan(doc, { exam, level, days, skillScores });
    const roadmap = roadmapFrom({
      id: `${exam}-${level}-${days}${profile ? `-${profile}` : ''}`,
      exam, level, days, planKey: key, ...a,
      examProfile: doc.examProfile || null,
      pipeline: [{ agent: 'global_cache', status: 'ok', detail: `served shared plan ${key}, rescheduled for exactly ${days} day(s)` }],
      source: 'global_cache'
    });
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ roadmap, polished: Boolean(doc.wording) });
  } catch (err) {
    console.error('[plan]', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Could not read the plan cache.' });
  }
}
