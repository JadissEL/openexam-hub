/**
 * Cookieless first-party visit counter: pure helpers shared by the Cloudflare Worker (worker/index.js,
 * which filters and strips each beacon) and the Vercel route (lib/routes/hit.js, which stores daily
 * aggregate counts). No cookies, no IDs, no IP address or full user agent is ever stored: only
 * per-day counts by page path, referrer host, utm_source, in-app-browser name and funnel event.
 * Pure and dependency-free so the Worker bundle can import it.
 */

export const HIT_EVENTS = ['preview_opened', 'signup_started', 'signup_completed'];

// Obvious automation. Real-browser beacons need JavaScript anyway, so this mostly catches headless
// tools, preview fetchers and our own QA scripts.
const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|monitor|scan|curl|wget|python|httpx|aiohttp|node|go-http|java\/|okhttp|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|audit|verify|research|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|slack/i;

export function isBotUserAgent(ua) {
  const s = String(ua || '');
  if (s.length < 20 || !/Mozilla\//.test(s)) return true;
  return BOT_UA.test(s);
}

/** Social app whose built-in browser this is (same list as src/AuthGate.jsx inAppBrowser), or null. */
export function inAppName(ua) {
  const s = String(ua || '');
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(s)) return 'facebook';
  if (/Instagram/.test(s)) return 'instagram';
  if (/LinkedInApp/.test(s)) return 'linkedin';
  if (/TwitterAndroid|Twitter for/.test(s)) return 'x';
  if (/Reddit\//.test(s)) return 'reddit';
  if (/TikTok|musical_ly|BytedanceWebview/.test(s)) return 'tiktok';
  if (/Snapchat/.test(s)) return 'snapchat';
  if (/MicroMessenger/.test(s)) return 'wechat';
  if (/ Line\//.test(s)) return 'line';
  if (/\bGSA\/|\bGmail\//i.test(s)) return 'gmail';
  if (/Android[^)]*; wv\)/.test(s)) return 'android_webview';
  return null;
}

const KNOWN_PATHS = /^\/(?:|app(?:\/[a-z-]{1,30})?|about|faq|funding|privacy|terms|exams(?:\/[a-z0-9-]{1,60}){0,2}|blog(?:\/tag\/[A-Za-z0-9_-]{1,40}|\/[a-z0-9-]{1,100})?)$/;

/** Page path without query/hash, trailing slash dropped; unknown shapes collapse to "(other)". */
export function normPath(p) {
  let s = String(p || '').split(/[?#]/)[0].slice(0, 160);
  if (s.length > 1) s = s.replace(/\/+$/, '');
  if (!s.startsWith('/')) return '(other)';
  return KNOWN_PATHS.test(s) ? s : '(other)';
}

const REF_ALIASES = [
  [/(^|\.)t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x.com'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, 'facebook.com'],
  [/(^|\.)instagram\.com$/, 'instagram.com'],
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'linkedin.com'],
  [/(^|\.)reddit\.com$|(^|\.)redd\.it$/, 'reddit.com'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube.com'],
  [/(^|\.)google\.[a-z.]{2,6}$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing.com'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo.com'],
  [/(^|\.)github\.com$/, 'github.com']
];

/** Referrer host, grouped for the big networks; "(direct)" for none, null for our own site. */
export function refHost(ref, ownHost = 'openexamhub.org') {
  const r = String(ref || '').trim();
  if (!r) return '(direct)';
  let host;
  if (/^android-app:\/\//i.test(r)) {
    host = r.slice(14).split('/')[0].toLowerCase();
    if (/twitter/.test(host)) return 'x.com';
    if (/facebook|katana/.test(host)) return 'facebook.com';
    if (/linkedin/.test(host)) return 'linkedin.com';
    if (/reddit/.test(host)) return 'reddit.com';
    if (/googlequicksearchbox|google/.test(host)) return 'google';
    return host.slice(0, 60).replace(/[^a-z0-9.-]/g, '') || '(other)';
  }
  try {
    host = new URL(r).hostname.toLowerCase();
  } catch {
    return '(other)';
  }
  host = host.replace(/^www\./, '');
  if (host === ownHost || host.endsWith(`.${ownHost}`)) return null;
  for (const [re, name] of REF_ALIASES) if (re.test(host)) return name;
  return /^[a-z0-9.-]{1,60}$/.test(host) ? host : '(other)';
}

/** utm_source value, lower-cased and limited to [a-z0-9_.-], or null. */
export function utmSource(src) {
  const s = String(src || '').trim().toLowerCase().slice(0, 40);
  return /^[a-z0-9_.-]+$/.test(s) ? s : null;
}

/**
 * Turn a raw beacon into the minimal record that is stored, or null to drop it.
 * Beacon: {t:'view'|'event', p, r?, u?, e?}. ua is only used here (never stored).
 */
export function sanitizeBeacon(body, ua) {
  if (!body || typeof body !== 'object') return null;
  if (isBotUserAgent(ua)) return null;
  const app = inAppName(ua);
  if (body.t === 'event') {
    const e = String(body.e || '');
    if (!HIT_EVENTS.includes(e)) return null;
    return { t: 'event', e, a: app };
  }
  if (body.t !== 'view') return null;
  const ref = refHost(body.r);
  return { t: 'view', p: normPath(body.p), r: ref, u: utmSource(body.u), a: app };
}

/** Calendar day in Athens time (the founder's day) as YYYY-MM-DD. */
export function athensDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Firestore map keys: no dots/slashes ambiguity worries with nested objects in set(merge), but keep
// them short and printable.
export const keyOf = (s) => String(s).slice(0, 120).replace(/[\u0000-\u001f`]/g, '');

/** Re-validate a record the Worker already sanitized (defence in depth on the storing side). */
export function validRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const app = typeof rec.a === 'string' && /^[a-z_]{1,20}$/.test(rec.a) ? rec.a : null;
  if (rec.t === 'event') return HIT_EVENTS.includes(rec.e) ? { t: 'event', e: rec.e, a: app } : null;
  if (rec.t !== 'view') return null;
  const p = normPath(rec.p);
  const r = rec.r === null ? null : typeof rec.r === 'string' && /^(\(direct\)|\(other\)|[a-z0-9.-]{1,60})$/.test(rec.r) ? rec.r : '(other)';
  return { t: 'view', p, r, u: utmSource(rec.u), a: app };
}

/** The Firestore set(merge) payload for one record. `inc` is FieldValue.increment. */
export function incrementsFor(rec, inc) {
  const one = inc(1);
  if (rec.t === 'event') {
    const out = { events: { [rec.e]: one } };
    if (rec.a) out.eventsInApp = { [`${rec.e}:${rec.a}`]: inc(1) };
    return out;
  }
  const out = { views: one, paths: { [keyOf(rec.p)]: inc(1) } };
  // An "entry" is a page view that did not come from another page of this site: the closest thing
  // to a visit we can count without any identifier.
  if (rec.r !== null) {
    out.entries = inc(1);
    out.refs = { [keyOf(rec.r)]: inc(1) };
    out.entryPaths = { [keyOf(rec.p)]: inc(1) };
  }
  if (rec.u) out.utm = { [keyOf(rec.u)]: inc(1) };
  if (rec.a) out.inApp = { [keyOf(rec.a)]: inc(1) };
  return out;
}
