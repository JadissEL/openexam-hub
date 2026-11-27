// Express Entry CRS points for official languages (first AND second official language, plus the
// French "additional points"). Pure data and maths, shared by /tools/crs-language-points, its
// prerender JSON-LD and scripts/test-crs.mjs. Every number below is copied from IRCC's
// "Comprehensive Ranking System (CRS) criteria" page (CRS_URL in clbData.js), sections
// "Official languages proficiency - first official language", "... - second official language"
// and "D. Additional points". No number here is estimated.
import { CRS_FIRST_LANGUAGE, CRS_URL, EE_LANGUAGE_URL, FRENCH_BONUS, SKILLS } from './clbData.js';

export const CRS_TOOL_PATH = '/tools/crs-language-points';
/** Date the CRS grid on canada.ca was last read for this page. */
export const CRS_LAST_VERIFIED = '2026-11-27';
export { CRS_URL, EE_LANGUAGE_URL, SKILLS };

/**
 * Second-official-language points for ONE ability. [with a spouse or partner, without].
 * IRCC: "CLB 4 or less 0; CLB 5 or 6: 1; CLB 7 or 8: 3; CLB 9 or more: 6".
 */
export const CRS_SECOND_LANGUAGE_ROWS = [
  { label: 'CLB 4 or less', min: 0, max: 4, points: [0, 0] },
  { label: 'CLB 5 or 6', min: 5, max: 6, points: [1, 1] },
  { label: 'CLB 7 or 8', min: 7, max: 8, points: [3, 3] },
  { label: 'CLB 9 or more', min: 9, max: 12, points: [6, 6] }
];
/** IRCC caps: 6 per ability, combined maximum 22 with a spouse or partner, 24 without. */
export const CRS_SECOND_LANGUAGE_MAX = [22, 24];
/** IRCC: first official language maximum 128 with a spouse or partner, 136 without. */
export const CRS_FIRST_LANGUAGE_MAX = [128, 136];
/** IRCC core factor "Official languages proficiency": 150 with a spouse or partner, 160 without. */
export const CRS_LANGUAGE_CORE_MAX = [150, 160];

export const CRS_FIRST_LANGUAGE_ROWS = [
  { label: 'Less than CLB 4', points: CRS_FIRST_LANGUAGE.below4 },
  { label: 'CLB 4 or 5', points: CRS_FIRST_LANGUAGE[4] },
  { label: 'CLB 6', points: CRS_FIRST_LANGUAGE[6] },
  { label: 'CLB 7', points: CRS_FIRST_LANGUAGE[7] },
  { label: 'CLB 8', points: CRS_FIRST_LANGUAGE[8] },
  { label: 'CLB 9', points: CRS_FIRST_LANGUAGE[9] },
  { label: 'CLB 10 or more', points: CRS_FIRST_LANGUAGE[10] }
];

/** Level choices for the selects: '' = no result, 3 = below CLB 4, 4..10 (10 = CLB 10 or more). */
export const LEVEL_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10];
export const levelOptionLabel = (lvl, scheme = 'CLB') =>
  lvl <= 3 ? `Below ${scheme} 4` : lvl >= 10 ? `${scheme} 10 or more` : `${scheme} ${lvl}`;

const idx = (withSpouse) => (withSpouse ? 0 : 1);

function toLevel(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 12 ? n : null;
}

export function firstLanguagePoints(level, withSpouse) {
  const l = toLevel(level);
  if (l === null || l < 4) return 0;
  return CRS_FIRST_LANGUAGE[Math.min(10, l)][idx(withSpouse)];
}

export function secondLanguagePoints(level, withSpouse) {
  const l = toLevel(level);
  if (l === null) return 0;
  const row = CRS_SECOND_LANGUAGE_ROWS.find((r) => l >= r.min && l <= r.max);
  return row ? row.points[idx(withSpouse)] : 0;
}

/**
 * first / second: { language: 'en' | 'fr', levels: { reading, listening, writing, speaking } }
 * (levels are CLB/NCLC numbers; 3 means below 4). `second` may be null (no second test).
 */
export function crsLanguagePoints({ first, second = null, withSpouse = false }) {
  const w = idx(withSpouse);
  const firstLv = Object.fromEntries(SKILLS.map((s) => [s, toLevel(first?.levels?.[s])]));
  const firstComplete = SKILLS.every((s) => firstLv[s] !== null);
  const firstPer = Object.fromEntries(SKILLS.map((s) => [s, firstLanguagePoints(firstLv[s], withSpouse)]));
  const firstTotal = SKILLS.reduce((a, s) => a + firstPer[s], 0);

  const hasSecond = Boolean(second && second.language && second.language !== first?.language);
  const secondLv = Object.fromEntries(SKILLS.map((s) => [s, hasSecond ? toLevel(second.levels?.[s]) : null]));
  const secondComplete = hasSecond && SKILLS.every((s) => secondLv[s] !== null);
  const secondPer = Object.fromEntries(SKILLS.map((s) => [s, hasSecond ? secondLanguagePoints(secondLv[s], withSpouse) : 0]));
  const secondRaw = SKILLS.reduce((a, s) => a + secondPer[s], 0);
  const secondTotal = Math.min(secondRaw, CRS_SECOND_LANGUAGE_MAX[w]);

  // French additional points: NCLC 7+ in all four French skills. 50 when English is CLB 5+ in all
  // four; 25 when English is CLB 4 or lower or there is no English test.
  const french = first?.language === 'fr' ? { lv: firstLv, ok: firstComplete } : hasSecond && second.language === 'fr' ? { lv: secondLv, ok: secondComplete } : null;
  const english = first?.language === 'en' ? { lv: firstLv, ok: firstComplete } : hasSecond && second.language === 'en' ? { lv: secondLv, ok: secondComplete } : null;
  let frenchBonus = 0;
  let frenchBonusCase = 'none';
  if (french && french.ok && SKILLS.every((s) => french.lv[s] >= 7)) {
    if (!english) {
      frenchBonus = FRENCH_BONUS.lowEnglish;
      frenchBonusCase = 'noEnglish';
    } else if (english.ok && SKILLS.every((s) => english.lv[s] >= 5)) {
      frenchBonus = FRENCH_BONUS.strongEnglish;
      frenchBonusCase = 'strongEnglish';
    } else if (english.ok && SKILLS.every((s) => english.lv[s] <= 4)) {
      frenchBonus = FRENCH_BONUS.lowEnglish;
      frenchBonusCase = 'lowEnglish';
    } else if (english.ok) {
      // Mixed English (some skills CLB 5+, some CLB 4 or lower): IRCC's table spells out only the two
      // cases above, so the tool shows no number rather than guess.
      frenchBonusCase = 'mixedEnglish';
    } else {
      frenchBonusCase = 'incomplete';
    }
  }

  return {
    withSpouse,
    first: { complete: firstComplete, perSkill: firstPer, total: firstTotal, max: CRS_FIRST_LANGUAGE_MAX[w] },
    second: hasSecond
      ? { complete: secondComplete, perSkill: secondPer, raw: secondRaw, total: secondTotal, capped: secondRaw > secondTotal, max: CRS_SECOND_LANGUAGE_MAX[w] }
      : null,
    core: { total: firstTotal + secondTotal, max: CRS_LANGUAGE_CORE_MAX[w] },
    frenchBonus,
    frenchBonusCase
  };
}

export const CRS_TOOL_H1 = 'CRS points for your first and second official language';
export const CRS_TOOL_TITLE = 'CRS second language points calculator · OpenExam Hub';
export const CRS_TOOL_DESCRIPTION =
  'Enter your CLB or NCLC levels in English and French to see the CRS points IRCC gives each: first and second official language, plus the French bonus.';

export const CRS_TOOL_FAQ = [
  {
    q: 'How many CRS points does a second official language give?',
    a: 'IRCC gives up to 6 points per ability for your second official language: 0 for CLB 4 or less, 1 for CLB 5 or 6, 3 for CLB 7 or 8 and 6 for CLB 9 or more. The total is capped at 22 points with a spouse or common-law partner and 24 without.'
  },
  {
    q: 'Which language is my first official language?',
    a: 'Express Entry scores one of English or French as your first official language and the other, if you have a valid test result for it, as your second. Your first official language earns up to 128 points with a spouse or partner and 136 without; the second up to 22 or 24.'
  },
  {
    q: 'What is the French bonus in CRS?',
    a: 'Under IRCC’s “Additional points”, NCLC 7 or higher in all four French skills earns 25 points if you scored CLB 4 or lower in English or took no English test, and 50 points if you also scored CLB 5 or higher in all four English skills. IRCC’s table does not depend on which of the two is your first official language.'
  },
  {
    q: 'Does the second language count if I score below CLB 5?',
    a: 'A second-language skill at CLB 4 or less earns 0 points on IRCC’s grid. Skills at CLB 5 or higher still earn points even if another skill is lower, because IRCC scores each ability separately.'
  },
  {
    q: 'Is this my full CRS score?',
    a: 'No. It covers only the official-language parts of the CRS grid and the French additional points. Age, education, work experience, skill transferability, your spouse’s factors and other additional points are not calculated here, and the tool gives no guarantee about your CRS score or an invitation.'
  },
  {
    q: 'Where do the numbers come from?',
    a: 'From IRCC’s “Comprehensive Ranking System (CRS) criteria” page on canada.ca, copied by hand and checked on the date shown on this page. To turn your test scores into CLB or NCLC levels first, use the CLB converter, which uses IRCC’s own test tables.'
  }
];
