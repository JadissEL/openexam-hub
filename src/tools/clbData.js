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
 *
 * IELTS General Training and CELPIP-General (IELTS_GT, CELPIP_G below) come from the same EE_LANGUAGE_URL
 * page (canada.ca, "Express Entry: Language test results"). IRCC's page date modified is
 * EE_LANGUAGE_MODIFIED (its dcterms.modified meta tag) and the values were transcribed on
 * ENGLISH_LAST_VERIFIED:
 *  - IELTS, CLB 7 to 10: the "Federal Skilled Worker Program > IELTS" table (first official language).
 *    CLB 4 to 10: the "Federal Skilled Trades Program > IELTS" table. The Canadian Experience Class table
 *    (CLB 5 to 10) prints the same numbers. IRCC lists ONE score per level (the lowest that earns it), and
 *    the top row as a range ("7.5-9.0").
 *  - CELPIP-General, CLB 4 to 9: "Federal Skilled Trades Program > CELPIP" (CLB level = score).
 *    CLB 10 ("10 and above CELPIP-G, 10+") is on the Federal Skilled Worker table. The top of the scale,
 *    12, is the upper end of IRCC's "5-12" second-official-language row.
 *  - Only IELTS General Training is accepted for Express Entry (not Academic, not One Skill Retake) and
 *    only CELPIP-General: IRCC's "Language tests we accept" table on the same page.
 *  - IRCC does not say what to do with an IELTS score that sits between two listed values (for example
 *    Listening 7.0, between 6.0 for CLB 7 and 7.5 for CLB 8). This tool puts it at the lower level, the
 *    highest level whose listed score has been reached. The page tells users to confirm on canada.ca.
 */

export const LAST_VERIFIED = '2026-11-26';
/** IELTS and CELPIP tables: transcribed from canada.ca on this date. */
export const ENGLISH_LAST_VERIFIED = '2026-11-27';
/** Date modified of EE_LANGUAGE_URL on the day it was read (the dcterms.modified meta tag in its HTML). */
export const EE_LANGUAGE_MODIFIED = '2026-10-16';

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

/**
 * Tables where IRCC lists the lowest score that earns each level (IELTS bands, CELPIP levels). Each band
 * runs from its listed score up to one step below the next level's listed score; the top band ends at
 * `top`. `rows` are [level, listedMinimum] pairs, CLB 4 up to 10.
 */
const ladder = (step, top, ...rows) =>
  rows.map(([level, min], i) => ({ level, min, max: i === rows.length - 1 ? top : Number((rows[i + 1][1] - step).toFixed(1)) }));

export const TABLES = {
  // IRCC: Express Entry > Language test results > TEF Canada ("Équivalence ancien score").
  TEF_EXPRESS_ENTRY: {
    id: 'TEF_EXPRESS_ENTRY',
    exam: 'TEF_CANADA',
    language: 'fr',
    scheme: 'NCLC',
    step: 1,
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
    language: 'fr',
    scheme: 'NCLC',
    step: 1,
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
    language: 'fr',
    scheme: 'NCLC',
    step: 1,
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
  },
  // IRCC: Express Entry > Language test results > IELTS (General Training only). See the header comment.
  IELTS_GT: {
    id: 'IELTS_GT',
    exam: 'IELTS',
    examName: 'IELTS',
    language: 'en',
    scheme: 'CLB',
    step: 0.5,
    listed: true,
    tab: 'IELTS General Training',
    label: 'IELTS General Training',
    short: 'IELTS General Training',
    expressEntry: true,
    sourceUrl: EE_LANGUAGE_URL,
    sourceLabel: 'IRCC: Express Entry, Language test results (IELTS General Training)',
    notice:
      'Express Entry accepts IELTS General Training only. IELTS Academic and IELTS One Skill Retake are not accepted, so enter General Training scores.',
    bands: {
      reading: ladder(0.5, 9, [4, 3.5], [5, 4.0], [6, 5.0], [7, 6.0], [8, 6.5], [9, 7.0], [10, 8.0]),
      listening: ladder(0.5, 9, [4, 4.5], [5, 5.0], [6, 5.5], [7, 6.0], [8, 7.5], [9, 8.0], [10, 8.5]),
      writing: ladder(0.5, 9, [4, 4.0], [5, 5.0], [6, 5.5], [7, 6.0], [8, 6.5], [9, 7.0], [10, 7.5]),
      speaking: ladder(0.5, 9, [4, 4.0], [5, 5.0], [6, 5.5], [7, 6.0], [8, 6.5], [9, 7.0], [10, 7.5])
    }
  },
  // IRCC: Express Entry > Language test results > CELPIP (CELPIP-General only). See the header comment.
  CELPIP_G: {
    id: 'CELPIP_G',
    exam: 'CELPIP',
    examName: 'CELPIP',
    language: 'en',
    scheme: 'CLB',
    step: 1,
    listed: true,
    tab: 'CELPIP-General',
    label: 'CELPIP-General',
    short: 'CELPIP-General',
    expressEntry: true,
    sourceUrl: EE_LANGUAGE_URL,
    sourceLabel: 'IRCC: Express Entry, Language test results (CELPIP-General)',
    notice: 'Express Entry accepts the CELPIP-General test. On IRCC’s table, a CELPIP-General level equals the CLB level.',
    bands: {
      reading: ladder(1, 12, [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10]),
      listening: ladder(1, 12, [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10]),
      writing: ladder(1, 12, [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10]),
      speaking: ladder(1, 12, [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10])
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

/** Show a score the way the test reports it: IELTS bands with one decimal (6.0), everything else as a whole number. */
export function formatScore(tableId, n) {
  return TABLES[tableId].step === 0.5 ? Number(n).toFixed(1) : String(n);
}

/**
 * Parse what the user typed. Returns { ok:true, value } for a score on the table's scale and inside its
 * range, { ok:false, empty:true } for a blank field, otherwise { ok:false, error }.
 * Whole-number tests take digits only. IELTS also takes a half-band such as 6.5 (a comma works too).
 */
export function parseScore(tableId, skill, raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { ok: false, empty: true };
  const half = TABLES[tableId].step === 0.5;
  if (half) {
    if (!/^\d{1,2}([.,]\d)?$/.test(s)) return { ok: false, error: 'Enter a band such as 6 or 6.5.' };
  } else if (!/^\d{1,4}$/.test(s)) {
    return { ok: false, error: 'Enter a whole number, digits only.' };
  }
  const value = Number(s.replace(',', '.'));
  if (half && Math.round(value * 2) !== value * 2) return { ok: false, error: 'IELTS bands go up in steps of 0.5, for example 6.0 or 6.5.' };
  const max = maxScore(tableId, skill);
  if (value > max) return { ok: false, error: `The highest score on IRCC’s table is ${formatScore(tableId, max)}.` };
  return { ok: true, value };
}

/** NCLC or CLB level (4 to 10) for a score, or 0 when the score is under the level 4 band. */
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
    frenchBonusEligible: complete && TABLES[tableId].expressEntry && TABLES[tableId].language === 'fr' ? lowestLevel >= 7 : false
  };
}

/** Planner level for the CTA: B2 while the gap to NCLC 7 is open, C1 once past it (aiming at NCLC 9). */
export function recommendedLevel(lowest) {
  if (lowest === null || lowest === undefined) return 'B2';
  return lowest < 7 ? 'B2' : 'C1';
}

/** Planner deep link for the CTA (CELPIP, IELTS, TEF Canada and TCF Canada all have plans). */
export function plannerHref(tableId, lowest) {
  const exam = TABLES[tableId].exam;
  return `/app?exam=${exam}&level=${recommendedLevel(lowest)}&days=30&utm_source=clb-tool`;
}

export function levelLabel(level, scheme = 'NCLC') {
  if (level === null || level === undefined) return '';
  if (level < 4) return `Below ${scheme} 4`;
  return level >= 10 ? `${scheme} 10` : `${scheme} ${level}`;
}
