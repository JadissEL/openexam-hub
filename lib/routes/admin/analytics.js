/**
 * GET /api/admin/analytics?days=14[&format=text] — Authorization: Bearer ADMIN_SECRET or OEH_OPS_SECRET.
 *
 * Reads the cookieless visit counter (lib/routes/hit.js): one doc per Athens day in analytics_daily.
 * Returns per-day totals (views, entries = views that did not come from another page of the site,
 * funnel events) and the top paths, entry paths, referrer hosts, utm_source values and in-app
 * browsers over the window. format=text gives a plain-text report for a terminal.
 */
import { requireAnyBearer, sendJson } from '../../auth.js';
import { getDb } from '../../firebaseAdmin.js';
import { athensDay, HIT_EVENTS } from '../../analytics/hits.js';
import { ANALYTICS_COLLECTION } from '../hit.js';

const add = (into, map) => {
  for (const [k, v] of Object.entries(map || {})) into[k] = (into[k] || 0) + (Number(v) || 0);
};
const top = (m, n = 15) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

export function summarise(docs) {
  const totals = { views: 0, entries: 0, events: {}, paths: {}, entryPaths: {}, refs: {}, utm: {}, inApp: {}, eventsInApp: {} };
  const byDay = [];
  for (const d of docs) {
    const events = Object.fromEntries(HIT_EVENTS.map((e) => [e, Number(d.events?.[e]) || 0]));
    byDay.push({ day: d.day, views: Number(d.views) || 0, entries: Number(d.entries) || 0, ...events });
    totals.views += Number(d.views) || 0;
    totals.entries += Number(d.entries) || 0;
    for (const k of ['events', 'paths', 'entryPaths', 'refs', 'utm', 'inApp', 'eventsInApp']) add(totals[k], d[k]);
  }
  return {
    byDay,
    totals: { views: totals.views, entries: totals.entries, events: totals.events },
    top: {
      paths: top(totals.paths),
      entryPaths: top(totals.entryPaths),
      referrers: top(totals.refs),
      utmSource: top(totals.utm),
      inAppBrowsers: top(totals.inApp),
      eventsInApp: top(totals.eventsInApp)
    }
  };
}

export function asText(s, days) {
  const lines = [`OpenExam Hub visit counter, last ${days} days (Athens days; bots excluded; no cookies or IDs)`, ''];
  lines.push('day         views entries preview signup_start signup_done');
  for (const r of s.byDay) {
    lines.push(`${r.day}  ${String(r.views).padStart(5)} ${String(r.entries).padStart(7)} ${String(r.preview_opened).padStart(7)} ${String(r.signup_started).padStart(12)} ${String(r.signup_completed).padStart(11)}`);
  }
  for (const [label, rows] of Object.entries(s.top)) {
    lines.push('', `${label}:`);
    if (!rows.length) lines.push('  (none)');
    for (const [k, v] of rows) lines.push(`  ${String(v).padStart(5)}  ${k}`);
  }
  return `${lines.join('\n')}\n`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!requireAnyBearer(req, res, ['ADMIN_SECRET', 'OEH_OPS_SECRET'])) return;
  try {
    const days = Math.max(1, Math.min(90, Number(req.query?.days) || 14));
    const ids = [];
    for (let i = days - 1; i >= 0; i--) ids.push(athensDay(new Date(Date.now() - i * 864e5)));
    const col = getDb().collection(ANALYTICS_COLLECTION);
    const snaps = await getDb().getAll(...ids.map((id) => col.doc(id)));
    const docs = snaps.map((sn, i) => (sn.exists ? sn.data() : { day: ids[i] }));
    const s = summarise(docs);
    if (req.query?.format === 'text') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(asText(s, days));
    }
    return sendJson(res, 200, { days, ...s });
  } catch (err) {
    console.error('[admin/analytics]', err?.message);
    return sendJson(res, 500, { error: 'could not read the counter' });
  }
}
