/**
 * TEF Canada / TCF Canada score -> NCLC (CLB) tables and CRS language points.
 * Plain data and pure functions only (no React, no browser globals) so the build-time prerender,
 * the browser and the unit tests (scripts/test-clb.mjs) all use the same numbers.
 *
 * EVERY number below was copied from canada.ca (IRCC) and re-checked on LAST_VERIFIED. If a table
 * can't be verified on canada.ca it does not belong in this file. When IRCC changes a table, edit it
 * here, update LAST_VERIFIED and the boundary tests together.
 *
 * Sources
 *  - EE_LANGUAGE_URL  Express Entry: Language test results. For TEF Canada it says: use the
 *    "Équivalence ancien score" column, not the "Score / 699" column. Its TEF table (levels 4 to 10) is
 *    TEF_EXPRESS_ENTRY below; its TCF Canada tables are TCF_CANADA. IRCC shows the same TCF table on
 *    the Start-up visa page.
 *  - START_UP_URL     Start-up visa: Language testing. Source of the TEF Canada table for tests
 *    taken after 10 December 2023 (Score / 699), TEF_NEW_699. The Francophone Community Immigration
 *    Pilot page prints the identical table. Express Entry does not use it.
 *  - CRS_URL          Express Entry: Comprehensive Ranking System (CRS) criteria, "Official languages
 *    proficiency - first official language" (points per ability, with or without a spouse or partner)
 *    and "Additional points" (French language skills).
 */

export const LAST_VERIFIED = '2026-11-26';

export const EE_LANGUAGE_URL =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html';
export const START_UP_URL =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/start-visa/language-testing.html';
export const CRS_URL =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html';

export const SKILLS = ['reading', 'listening', 'writing', 'speaking'];

export const SKILL_LABELS = {
  reading: { en: 'Reading', fr: 'Compréhension de l’écrit' },
  listening: { en: 'Listening', fr: 'Compréhension de l’oral' },
  writing: { en: 'Writing', fr: 'Expression écrite' },
  speaking: { en: 'Speaking', fr: 'Expression orale' }
};

/** [level, min, max] rows per skill, NCLC 4 up to 10 (10 is the top band: "10 and above"). */
const band = (...rows) => rows.map(([level, min, max]) => ({ level, min, max }));

export const TABLES = {
  // IRCC: Express Entry > Language test results > TEF Canada ("Équivalence ancien score").
  TEF_EXPRESS_ENTRY: {
    id: 'TEF_EXPRESS_ENTRY',
    exam: 'TEF_CANADA',
    tab: 'TEF Canada',
    label: 'TEF Canada · Express Entry scale (“Équivalence ancien score”)',
    short: 'Express Entry scale',
    expressEntry: true,
    sourceUrl: EE_LANGUAGE_URL,
    sourceLabel: 'IRCC: Express Entry, Language test results (TEF Canada)',
    bands: {
      reading: band([4, 121, 150], [5, 151, 180], [6, 181, 206], [7, 207, 232], [8, 233, 247], [9, 248, 262], [10, 263, 300]),
      listening: band([4, 145, 180], [5, 181, 216], [6, 217, 248], [7, 249, 279], [8, 280, 297], [9, 298, 315], [10, 316, 360]),
      writing: band([4, 181, 225], [5, 226, 270], [6, 271, 309], [7, 310, 348], [8, 349, 370], [9, 371, 392], [10, 393, 450]),
      speaking: band([4, 181, 225], [5, 226, 270], [6, 271, 309], [7, 310, 348], [8, 349, 370], [9, 371, 392], [10, 393, 450])
    }
  },
  // IRCC: Start-up visa / Francophone Community Immigration Pilot > TEF Canada, "after December 10, 2023".
  // NOT accepted for Express Entry profiles (IRCC: "They aren't compatible with our system").
  TEF_NEW_699: {
    id: 'TEF_NEW_699',
    exam: 'TEF_CANADA',
    tab: 'TEF Canada',
    label: 'TEF Canada · new “Score / 699” scale (tests after 10 Dec 2023, not for Express Entry)',
    short: 'New score /699',
    expressEntry: false,
    sourceUrl: START_UP_URL,
    sourceLabel: 'IRCC: Start-up visa, Language testing (TEF Canada, tests after 10 December 2023)',
    bands: {
      reading: band([4, 306, 351], [5, 352, 392], [6, 393, 433], [7, 434, 461], [8, 462, 502], [9, 503, 545], [10, 546, 699]),
      listening: band([4, 306, 351], [5, 352, 392], [6, 393, 433], [7, 434, 461], [8, 462, 502], [9, 503, 545], [10, 546, 699]),
      writing: band([4, 268, 329], [5, 330, 378], [6, 379, 427], [7, 428, 471], [8, 472, 511], [9, 512, 557], [10, 558, 699]),
      speaking: band([4, 328, 386], [5, 387, 421], [6, 422, 455], [7, 456, 493], [8, 494, 517], [9, 518, 555], [10, 556, 699])
    }
  },
  // IRCC: Express Entry > Language test results > TCF Canada (same table on the Start-up visa page).
  TCF_CANADA: {
    id: 'TCF_CANADA',
    exam: 'TCF_CANADA',
    tab: 'TCF Canada',
    label: 'TCF Canada',
    short: 'TCF Canada',
    expressEntry: true,
    sourceUrl: EE_LANGUAGE_URL,
    sourceLabel: 'IRCC: Express Entry, Language test results (TCF Canada)',
    bands: {
      reading: band([4, 342, 374], [5, 375, 405], [6, 406, 452], [7, 453, 498], [8, 499, 523], [9, 524, 548], [10, 549, 699]),
      listening: band([4, 331, 368], [5, 369, 397], [6, 398, 457], [7, 458, 502], [8, 503, 522], [9, 523, 548], [10, 549, 699]),
      writing: band([4, 4, 5], [5, 6, 6], [6, 7, 9], [7, 10, 11], [8, 12, 13], [9, 14, 15], [10, 16, 20]),
      speaking: band([4, 4, 5], [5, 6, 6], [6, 7, 9], [7, 10, 11], [8, 12, 13], [9, 14, 15], [10, 16, 20])
    }
  }
};

export const TABLE_IDS = Object.keys(TABLES);

/** Highest score that appears on IRCC's table for a skill (the top of the NCLC 10 band). */
export function maxScore(tableId, skill) {
  const rows = TABLES[tableId].bands[skill];
  return rows[rows.length - 1].max;
}

/** Lowest score on IRCC's table (the bottom of the NCLC 4 band). Anything under it is "below NCLC 4". */
export function minScore(tableId, skill) {
  return TABLES[tableId].bands[skill][0].min;
}

/**
 * Parse what the user typed. Returns { ok:true, value } for a whole number inside the table's
 * range, { ok:false, empty:true } for a blank field, otherwise { ok:false, error }.
 */
export function parseScore(tableId, skill, raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { ok: false, empty: true };
  if (!/^\d{1,4}$/.test(s)) return { ok: false, error: 'Enter a whole number, digits only.' };
  const value = Number(s);
  const max = maxScore(tableId, skill);
  if (value > max) return { ok: false, error: `The highest score on IRCC’s table is ${max}.` };
  return { ok: true, value };
}

/** NCLC level (4 to 10) for a score, or 0 when the score is under the NCLC 4 band. */
export function levelFor(tableId, skill, score) {
  const rows = TABLES[tableId].bands[skill];
  const n = Number(score);
  if (!Number.isFinite(n) || n < 0 || n > rows[rows.length - 1].max) return null;
  const hit = rows.find((r) => n >= r.min && n <= r.max);
  return hit ? hit.level : 0;
}

/**
 * First-official-language CRS points for ONE ability (reading, writing, speaking or listening).
 * CRS_URL, "Official languages proficiency - first official language". level 0 = under CLB 4.
 */
export const CRS_FIRST_LANGUAGE = {
  // level: [with a spouse or common-law partner, without]
  below4: [0, 0],
  4: [6, 6],
  5: [6, 6],
  6: [8, 9],
  7: [16, 17],
  8: [22, 23],
  9: [29, 31],
  10: [32, 34]
};

export function crsPointsFor(level, withSpouse) {
  const l = Number(level);
  if (!Number.isFinite(l) || l < 4) return 0;
  const row = CRS_FIRST_LANGUAGE[Math.min(10, l)];
  return row[withSpouse ? 0 : 1];
}

/** Extra CRS points for French (CRS_URL, "Additional points"), when all four abilities are NCLC 7+. */
export const FRENCH_BONUS = { lowEnglish: 25, strongEnglish: 50 };

/** Convert four scores. `scores` maps skill -> raw input text (or number). */
export function convert(tableId, scores, { withSpouse = false } = {}) {
  const perSkill = {};
  let allValid = true;
  let lowest = null;
  let crsTotal = 0;
  for (const skill of SKILLS) {
    const parsed = parseScore(tableId, skill, scores?.[skill]);
    if (!parsed.ok) {
      perSkill[skill] = { ...parsed, level: null, points: null };
      allValid = false;
      continue;
    }
    const level = levelFor(tableId, skill, parsed.value);
    const points = crsPointsFor(level, withSpouse);
    perSkill[skill] = { ok: true, value: parsed.value, level, points };
    crsTotal += points;
    lowest = lowest === null ? level : Math.min(lowest, level);
  }
  const complete = allValid;
  const lowestLevel = complete ? lowest : null;
  const below = (n) => (complete ? SKILLS.filter((s) => perSkill[s].level < n) : []);
  return {
    tableId,
    perSkill,
    complete,
    lowest: lowestLevel,
    meets7: complete ? lowestLevel >= 7 : null,
    meets9: complete ? lowestLevel >= 9 : null,
    below7: below(7),
    below9: below(9),
    crs: complete && TABLES[tableId].expressEntry ? { total: crsTotal, max: withSpouse ? 128 : 136, withSpouse } : null,
    frenchBonusEligible: complete && TABLES[tableId].expressEntry ? lowestLevel >= 7 : false
  };
}

/** Planner level for the CTA: B2 while the gap to NCLC 7 is open, C1 once past it (aiming at NCLC 9). */
export function recommendedLevel(lowest) {
  if (lowest === null || lowest === undefined) return 'B2';
  return lowest < 7 ? 'B2' : 'C1';
}

export function plannerHref(tableId, lowest) {
  const exam = TABLES[tableId].exam;
  return `/app?exam=${exam}&level=${recommendedLevel(lowest)}&days=30&utm_source=clb-tool`;
}

export function levelLabel(level) {
  if (level === null || level === undefined) return '';
  if (level < 4) return 'Below NCLC 4';
  return level >= 10 ? 'NCLC 10' : `NCLC ${level}`;
}
