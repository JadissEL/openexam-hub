import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';
import { normalizeUrl } from './allowlist.js';

export const SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary', 'mock_exam', 'exam_format'];
const FRESH_DAYS = 14;

export const resourcesCol = () => pub().collection('resources');
export const resourceId = (url) => createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 24);

const isFresh = (r) => {
  const t = r.lastCheckedAt?.toMillis?.() ?? 0;
  return Date.now() - t < FRESH_DAYS * 864e5;
};

/** Library-first lookup: approved, reachable resources for an exam (and level, if tagged). */
export async function findResources({ exam, level, limit = 12 }) {
  const snap = await resourcesCol()
    .where('exams', 'array-contains', exam)
    .where('approved', '==', true)
    .where('linkStatus', 'in', ['ok', 'unverified'])
    .limit(60)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => !r.levels?.length || r.levels.includes(level))
    .sort((a, b) => Number(b.linkStatus === 'ok') - Number(a.linkStatus === 'ok') || (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, limit)
    .map((r) => ({ ...r, fresh: isFresh(r) }));
}

/** Insert or merge a verified resource. Tags are unioned so one URL serves many exams/levels. */
export async function upsertResource(r, { approved = true, addedBy = 'discovery' } = {}) {
  const url = normalizeUrl(r.url);
  const ref = resourcesCol().doc(resourceId(url));
  const snap = await ref.get();
  const base = {
    url,
    title: r.title,
    category: r.category,
    ...(r.skills?.length ? { skills: FieldValue.arrayUnion(...r.skills) } : {}),
    ...(r.exams?.length ? { exams: FieldValue.arrayUnion(...r.exams) } : {}),
    ...(r.levels?.length ? { levels: FieldValue.arrayUnion(...r.levels) } : {}),
    license: r.license,
    linkStatus: r.linkStatus,
    httpCode: r.httpCode ?? null,
    lastCheckedAt: FieldValue.serverTimestamp()
  };
  if (snap.exists) {
    await ref.set(base, { merge: true });
  } else {
    // New doc: write plain arrays (an empty list means "all levels" to findResources).
    await ref.set({
      ...base,
      skills: r.skills || [],
      exams: r.exams || [],
      levels: r.levels || [],
      approved,
      addedBy,
      usageCount: 0,
      firstAddedAt: FieldValue.serverTimestamp()
    });
  }
  return ref.id;
}

export async function markUsed(ids) {
  await Promise.all(ids.map((id) => resourcesCol().doc(id).set({ usageCount: FieldValue.increment(1) }, { merge: true })));
}
