/**
 * Hero social-proof copy from the live registered-user count.
 * No invented numbers: unknown/invalid counts yield null (the hero shows nothing).
 * Very small counts stay honest instead of "0 users" or "Join 1 learner".
 */
export const FIRST_LEARNERS_MAX = 4;

export function learnersProof(count, templates) {
  if (count == null || !Number.isFinite(Number(count)) || Number(count) < 0) return null;
  const n = Math.floor(Number(count));
  if (!templates) {
    if (n <= FIRST_LEARNERS_MAX) return 'Be one of the first learners.';
    return `Join ${n.toLocaleString('en-GB')} learners.`;
  }
  if (n <= FIRST_LEARNERS_MAX) return templates.first;
  return String(templates.join).replaceAll('{count}', n.toLocaleString('en-GB'));
}
