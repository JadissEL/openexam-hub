/**
 * Related reading for blog posts. Curated pairs first (only rendered when both
 * posts are in the published list), then same-exam posts to fill the list.
 * This lives in the template, not in post bodies.
 */

/** Preferred related slugs, in display order, keyed by the current post's slug. */
export const RELATED_POST_SLUGS = {
  'ielts-6-5-in-30-days': ['ielts-to-cefr', 'ielts-to-clb-express-entry'],
  'ielts-for-express-entry-academic-or-general': ['ielts-to-clb-express-entry', 'toefl-vs-ielts'],
  'ielts-fees-registration-2027-test-dates': ['toefl-vs-ielts', 'ielts-to-cefr'],
  'celpip-to-clb-express-entry': ['ielts-to-clb-express-entry'],
  'delf-dalf-express-entry': ['delf-vs-tcf-which-french-test'],
  'tef-canada-vs-tcf-canada': ['delf-vs-tcf-which-french-test'],
  'tcf-canada-clb-nclc-express-entry': ['delf-vs-tcf-which-french-test'],
  'ielts-to-clb-express-entry': ['ielts-to-cefr', 'ielts-for-express-entry-academic-or-general'],
  'ielts-to-cefr': ['ielts-to-clb-express-entry', 'ielts-6-5-in-30-days'],
  'toefl-vs-ielts': ['ielts-to-cefr', 'ielts-for-express-entry-academic-or-general'],
  'delf-vs-tcf-which-french-test': ['delf-dalf-express-entry', 'tef-canada-vs-tcf-canada']
};

export function relatedPostsFor(post, posts, { limit = 3 } = {}) {
  if (!post) return [];
  const bySlug = new Map(
    (posts || [])
      .filter((p) => p && !p.draft && p.slug !== post.slug)
      .map((p) => [p.slug, p])
  );
  const out = [];
  const seen = new Set();
  for (const slug of RELATED_POST_SLUGS[post.slug] || []) {
    const next = bySlug.get(slug);
    if (next && !seen.has(slug)) {
      out.push(next);
      seen.add(slug);
    }
    if (out.length >= limit) return out;
  }
  const rest = [...bySlug.values()]
    .filter((p) => !seen.has(p.slug))
    .map((p) => ({
      p,
      shared: (p.exams || []).filter((e) => (post.exams || []).includes(e)).length
    }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => {
      if (b.shared !== a.shared) return b.shared - a.shared;
      if (a.p.date !== b.p.date) return a.p.date < b.p.date ? 1 : -1;
      return a.p.slug.localeCompare(b.p.slug);
    });
  for (const x of rest) {
    out.push(x.p);
    if (out.length >= limit) break;
  }
  return out;
}
