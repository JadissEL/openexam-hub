/**
 * New-signup email alerts for the founder ("someone just created an account").
 *
 * Trigger (real time): right after a brand-new account signs in, the app calls
 *   POST /api/account {action:'signup-notify', exam?, locale?, timeZone?}  (Firebase ID token)
 * fire-and-forget (src/signupAlert.js). The server trusts nothing from the body except optional
 * display hints: the uid comes from the verified token, the account must be non-anonymous and
 * created in the last SIGNUP_ALERT_MAX_AGE_MS (so old accounts cannot trigger alerts), and a
 * server-only claim doc public/data/signup_alerts/{uid} (absent from the public rules -> clients
 * can neither read nor write it) is created atomically, so each account alerts at most once.
 *
 * Backstop: the nightly cleanup cron calls sweepMissedSignups(), which alerts for recent
 * registered accounts that have no claim doc (tab closed before the call, network error, key
 * not configured yet...).
 *
 * Email goes through the Resend HTTP API (RESEND_API_KEY). No key -> logged and skipped; the
 * claim is released so a later call or the sweep can still deliver. Sending never throws.
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { pub } from './firebaseAdmin.js';
import { isAnonymousUser, USERS_DOC_ID } from './userCount.js';
import { BRAND, SITE_URL, LOGO_URL, esc } from './emailTemplate.js';
import { examLabel, isKnownExam, mapExamIds, EXAM_LANG, LANG_NAME } from './exams.js';

export const SIGNUP_ALERT_DEFAULT_TO = 'elantaki.dijadiss@gmail.com';
export const SIGNUP_ALERT_DEFAULT_FROM = 'OpenExam Hub <notifications@openexamhub.org>';
export const RESEND_DEFAULT_URL = 'https://api.resend.com/emails';
export const SIGNUP_ALERT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const SWEEP_WINDOW_MS = 48 * 60 * 60 * 1000;
export const SWEEP_MAX = 10;
export const SEND_TIMEOUT_MS = 6000;
export const TIME_ZONE = 'Europe/Athens';
export const CLAIMS_COLLECTION = 'signup_alerts';
export const FIREBASE_CONSOLE_USERS_URL = 'https://console.firebase.google.com/project/openexam-hub/authentication/users';
export { SITE_URL, BRAND };

// ---------------------------------------------------------------------------------- helpers

export function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return '';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!domain) return '';
  return `${local[0]}***@${domain}`;
}

const PROVIDERS = {
  password: 'Email & password',
  'google.com': 'Google',
  'apple.com': 'Apple',
  'github.com': 'GitHub',
  'microsoft.com': 'Microsoft',
  'facebook.com': 'Facebook',
  'twitter.com': 'X (Twitter)',
  phone: 'Phone',
  emailLink: 'Email link',
  custom: 'Custom token'
};
export function signInMethodLabel(provider) {
  const p = String(provider || '').trim();
  if (!p) return 'Unknown';
  return PROVIDERS[p] || p;
}

/** The sign-in method of a user record (first linked provider), or the token's provider. */
export function providerOf(userRecord, decoded) {
  return decoded?.firebase?.sign_in_provider || userRecord?.providerData?.[0]?.providerId || '';
}

export function formatAthens(date) {
  const d = date instanceof Date ? date : new Date(date);
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
  return `${s} (Athens time)`;
}

/** YYYY-MM-DD of `date` in Europe/Athens. */
export function athensDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function countryName(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === 'XX' || c === 'T1') return '';
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(c);
    return name && name !== c ? name : c;
  } catch {
    return c;
  }
}

export function flagEmoji(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === 'XX' || c === 'T1') return '';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
}

/** Validated, display-only hints from the client body. Anything malformed becomes null. */
export function cleanHints(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  let exam = null;
  if (typeof b.exam === 'string' && b.exam.length <= 40) {
    const ids = mapExamIds(b.exam);
    if (ids.length) exam = ids[0];
    else if (isKnownExam(b.exam)) exam = b.exam.trim().toUpperCase();
  }
  const locale = typeof b.locale === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(b.locale) ? b.locale : null;
  const timeZone = typeof b.timeZone === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(b.timeZone) && b.timeZone.length <= 64 ? b.timeZone : null;
  return { exam, locale, timeZone };
}

/** Country code forwarded by the Cloudflare Worker (trusted only with the proxy key), else Vercel's. */
export function countryFromRequest(req, safeEqual) {
  const h = req?.headers || {};
  const key = process.env.PROXY_SHARED_SECRET;
  if (key && typeof h['x-oeh-proxy-key'] === 'string' && safeEqual(h['x-oeh-proxy-key'], key)) {
    const c = String(h['x-oeh-client-country'] || '').toUpperCase();
    return /^[A-Z]{2}$/.test(c) ? c : null;
  }
  const v = String(h['x-vercel-ip-country'] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

/** One listUsers pass: registered (non-anonymous) total and how many were created today (Athens). */
export async function signupStats({ now = new Date(), listPage } = {}) {
  const list = listPage || ((max, token) => getAuth().listUsers(max, token));
  const today = athensDayKey(now);
  let total = 0;
  let todayCount = 0;
  let pageToken;
  do {
    const page = await list(1000, pageToken);
    for (const u of page?.users || []) {
      if (isAnonymousUser(u)) continue;
      total += 1;
      const created = Date.parse(u.metadata?.creationTime || '');
      if (Number.isFinite(created) && athensDayKey(new Date(created)) === today) todayCount += 1;
    }
    pageToken = page?.pageToken;
  } while (pageToken);
  return { total, today: todayCount };
}

// ---------------------------------------------------------------------------------- template

const ordinal = (n) => {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suf}`;
};

/**
 * @param {object} d
 * @param {string} [d.displayName]
 * @param {string} [d.maskedEmail]
 * @param {string} d.method        human label (signInMethodLabel)
 * @param {string|null} [d.exam]   exam id (TEF_CANADA ...)
 * @param {string|null} [d.country] ISO code
 * @param {string|null} [d.locale]
 * @param {string|null} [d.timeZone]
 * @param {Date|string|number} d.createdAt
 * @param {number|null} [d.total]  registered learners now
 * @param {number|null} [d.today]  signups today (Athens)
 * @param {string} [d.via]         'app' | 'daily-sweep'
 */
export function renderSignupEmail(d) {
  const B = BRAND;
  const who = d.displayName ? String(d.displayName).slice(0, 80) : d.maskedEmail || 'A new learner';
  const total = Number.isFinite(d.total) ? d.total : null;
  const today = Number.isFinite(d.today) ? d.today : null;
  const examName = d.exam ? examLabel(d.exam) : null;
  const lang = d.exam && EXAM_LANG[d.exam] ? LANG_NAME[EXAM_LANG[d.exam]] : null;
  const examLine = examName ? `${examName}${lang ? ` · ${lang}` : ''}` : null;
  const cName = countryName(d.country);
  const where = [cName ? `${flagEmoji(d.country)} ${cName}`.trim() : null, d.locale || null].filter(Boolean).join(' · ') || null;
  const when = formatAthens(d.createdAt);
  const sweep = d.via === 'daily-sweep';

  const subject = total
    ? `🎉 New learner joined: ${who} (learner #${total})`
    : `🎉 New learner joined: ${who}`;

  const rows = [
    ['Learner', d.displayName && d.maskedEmail ? `${who} · ${d.maskedEmail}` : who],
    ['Signed up with', d.method],
    examLine ? ['Target exam', examLine] : null,
    where ? ['From', where] : null,
    d.timeZone ? ['Time zone', d.timeZone] : null,
    ['Joined', when]
  ].filter(Boolean);

  const headline = total ? `Your ${ordinal(total)} learner just joined` : 'A new learner just joined';
  const preheader = `${who} created an OpenExam Hub account${examName ? ` for ${examName}` : ''}.${today != null ? ` ${today} today.` : ''}`;

  const stat = (value, label) => `
              <td class="oeh-stat" width="48%" valign="top" style="padding:18px 16px;background-color:${B.cream};border:1px solid ${B.line};border-radius:14px;text-align:center;">
                <div class="oeh-ink" style="font-family:${B.serif};font-size:34px;line-height:38px;font-weight:600;color:${B.ink};letter-spacing:-0.5px;">${esc(value)}</div>
                <div class="oeh-muted" style="font-family:${B.sans};font-size:12px;line-height:16px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${B.muted};padding-top:6px;">${esc(label)}</div>
              </td>`;

  const detailRows = rows
    .map(
      ([k, v], i) => `
                <tr>
                  <td class="oeh-muted oeh-row" valign="top" style="padding:12px 0;${i ? `border-top:1px solid ${B.line};` : ''}font-family:${B.sans};font-size:13px;line-height:20px;color:${B.muted};width:130px;">${esc(k)}</td>
                  <td class="oeh-ink oeh-row" valign="top" style="padding:12px 0;${i ? `border-top:1px solid ${B.line};` : ''}font-family:${B.sans};font-size:15px;line-height:20px;font-weight:600;color:${B.ink};">${esc(v)}</td>
                </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
  body { margin:0; padding:0; }
  table { border-collapse:collapse; }
  a { text-decoration:none; }
  @media (max-width: 620px) {
    .oeh-container { width:100% !important; }
    .oeh-pad { padding-left:22px !important; padding-right:22px !important; }
    .oeh-h1 { font-size:30px !important; line-height:36px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .oeh-bg { background-color:#141210 !important; }
    .oeh-card { background-color:#1F1C19 !important; border-color:#34302B !important; }
    .oeh-stat { background-color:#26221E !important; border-color:#34302B !important; }
    .oeh-ink { color:#F7F5F0 !important; }
    .oeh-muted { color:#C9BFB3 !important; }
    .oeh-accent { color:#FB923C !important; }
    .oeh-row { border-color:#34302B !important; }
  }
  [data-ogsc] .oeh-ink { color:#F7F5F0 !important; }
  [data-ogsc] .oeh-muted { color:#C9BFB3 !important; }
</style>
</head>
<body class="oeh-bg" style="margin:0;padding:0;background-color:${B.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${B.cream};">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" class="oeh-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.cream};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">
      <table role="presentation" class="oeh-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <!-- wordmark -->
        <tr>
          <td class="oeh-pad" style="padding:0 8px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="36" height="36" valign="middle" style="width:36px;height:36px;"><img src="${LOGO_URL}" width="36" height="36" alt="OpenExam Hub" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;border-radius:9px;" /></td>
                <td class="oeh-ink" style="padding-left:10px;font-family:${B.sans};font-size:17px;font-weight:600;letter-spacing:-0.2px;color:${B.ink};">OpenExam <span class="oeh-accent" style="color:${B.accent};">Hub</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- card -->
        <tr>
          <td>
            <table role="presentation" class="oeh-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${B.paper}" style="border-collapse:separate;border-spacing:0;background-color:${B.paper};border:1px solid ${B.line};border-radius:24px;">
              <tr><td height="6" style="height:6px;line-height:6px;font-size:0;background-color:${B.accent};background-image:linear-gradient(90deg,${B.tileFrom},${B.accent} 55%,${B.tileTo});border-radius:23px 23px 0 0;">&nbsp;</td></tr>
              <tr>
                <td class="oeh-pad" style="padding:34px 40px 8px;">
                  <div class="oeh-accent" style="font-family:${B.sans};font-size:12px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${B.accentDark};">New learner joined 🎉</div>
                  <h1 class="oeh-h1 oeh-ink" style="margin:12px 0 0;font-family:${B.serif};font-size:36px;line-height:42px;font-weight:500;letter-spacing:-0.8px;color:${B.ink};">${esc(headline)}</h1>
                  <p class="oeh-muted" style="margin:14px 0 0;font-family:${B.sans};font-size:16px;line-height:26px;color:${B.muted};"><strong class="oeh-ink" style="color:${B.ink};">${esc(who)}</strong> just created a free account${examName ? ` to prepare for <strong class="oeh-ink" style="color:${B.ink};">${esc(examName)}</strong>` : ''}. Someone out there is starting their exam journey with you.</p>
                </td>
              </tr>
              ${
                total != null || today != null
                  ? `<tr>
                <td class="oeh-pad" style="padding:24px 40px 4px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;">
                    <tr>${stat(total != null ? total.toLocaleString('en-US') : '–', 'Learners total')}
              <td width="4%" style="width:4%;font-size:0;line-height:0;">&nbsp;</td>${stat(today != null ? today.toLocaleString('en-US') : '–', 'Joined today')}
                    </tr>
                  </table>
                </td>
              </tr>`
                  : ''
              }
              <tr>
                <td class="oeh-pad" style="padding:20px 40px 8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}
                  </table>
                </td>
              </tr>
              <tr>
                <td class="oeh-pad" style="padding:22px 40px 36px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="${B.accent}" style="border-radius:999px;background-color:${B.accent};">
                        <a href="${FIREBASE_CONSOLE_USERS_URL}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${B.sans};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;white-space:nowrap;">Open Firebase users&nbsp;&rarr;</a>
                      </td>
                      <td style="padding-left:18px;font-family:${B.sans};font-size:15px;line-height:20px;">
                        <a class="oeh-accent" href="${SITE_URL}/app" target="_blank" style="color:${B.accent};font-weight:600;text-decoration:underline;white-space:nowrap;">Your dashboard</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td class="oeh-pad oeh-muted" style="padding:22px 8px 0;font-family:${B.sans};font-size:12px;line-height:19px;color:${B.soft};">
            Signup alert from <a class="oeh-accent" href="${SITE_URL}" style="color:${B.accent};">openexamhub.org</a>${sweep ? ' · caught by the nightly check (the live alert did not arrive)' : ''}. Emails are masked for privacy; full details live in the Firebase console. Change the recipient with the SIGNUP_ALERT_TO env var on Vercel.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `NEW LEARNER JOINED 🎉`,
    headline,
    '',
    `${who} just created a free OpenExam Hub account${examName ? ` to prepare for ${examName}` : ''}.`,
    '',
    total != null ? `Learners total: ${total}` : null,
    today != null ? `Joined today: ${today}` : null,
    total != null || today != null ? '' : null,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `Firebase users: ${FIREBASE_CONSOLE_USERS_URL}`,
    `Dashboard: ${SITE_URL}/app`,
    '',
    sweep ? 'Caught by the nightly check (the live alert did not arrive).' : null,
    '— OpenExam Hub signup alerts (recipient: SIGNUP_ALERT_TO on Vercel)'
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------------- sending

/**
 * POST to Resend with a hard timeout. Never throws.
 * @returns {Promise<{ok:boolean, id?:string, skipped?:string, error?:string}>}
 */
export async function sendResendEmail({ to, from, subject, html, text, apiKey = process.env.RESEND_API_KEY, timeoutMs = SEND_TIMEOUT_MS, fetchImpl = globalThis.fetch, url = process.env.RESEND_API_URL || RESEND_DEFAULT_URL, idempotencyKey, replyTo, tag = 'signup_alert' } = {}) {
  if (!apiKey) {
    console.warn('[signup-alert] RESEND_API_KEY is not set; skipping the email');
    return { ok: false, skipped: 'not-configured' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}), tags: [{ name: 'type', value: tag }] }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[signup-alert] Resend rejected the email', res.status, data?.name || data?.message || '');
      return { ok: false, error: `resend ${res.status}` };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[signup-alert] Resend call failed', err?.name === 'AbortError' ? 'timeout' : err?.message);
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export function alertRecipient() {
  return String(process.env.SIGNUP_ALERT_TO || '').trim() || SIGNUP_ALERT_DEFAULT_TO;
}
export function alertSender() {
  return String(process.env.SIGNUP_ALERT_FROM || '').trim() || SIGNUP_ALERT_DEFAULT_FROM;
}

let statsImpl = (opts) => signupStats(opts);
let sendImpl = (msg) => sendResendEmail(msg);
/** Test seams. Pass null to restore. */
export function setSignupAlertSeamsForTests({ stats, send } = {}) {
  statsImpl = stats || ((opts) => signupStats(opts));
  sendImpl = send || ((msg) => sendResendEmail(msg));
}

const claimRef = (uid) => pub().collection(CLAIMS_COLLECTION).doc(uid);

/**
 * Claim -> count -> render -> send. Releases the claim when the email did not go out.
 * @returns {Promise<{status:'sent'|'duplicate'|'not-new'|'anonymous'|'not-configured'|'failed', id?:string}>}
 */
export async function notifySignup({ userRecord, decoded = null, hints = {}, country = null, via = 'app', now = new Date() }) {
  if (!userRecord?.uid) return { status: 'failed' };
  if (isAnonymousUser(userRecord)) return { status: 'anonymous' };
  const created = Date.parse(userRecord.metadata?.creationTime || '');
  const maxAge = via === 'daily-sweep' ? SWEEP_WINDOW_MS : SIGNUP_ALERT_MAX_AGE_MS;
  if (!Number.isFinite(created) || now.getTime() - created > maxAge) return { status: 'not-new' };
  if (!process.env.RESEND_API_KEY) {
    console.warn('[signup-alert] RESEND_API_KEY is not set; skipping (claim not taken, the nightly sweep will retry)');
    return { status: 'not-configured' };
  }

  const ref = claimRef(userRecord.uid);
  try {
    await ref.create({ via, claimedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if (err?.code === 6 || /already exists/i.test(err?.message || '')) return { status: 'duplicate' };
    console.error('[signup-alert] claim failed', err?.code || err?.message);
    return { status: 'failed' };
  }

  let stats = { total: null, today: null };
  try {
    stats = await statsImpl({ now });
    // Keep the public learner counter (stats/users, used by /api/stats) fresh while we are at it.
    pub().collection('stats').doc(USERS_DOC_ID).set({ registeredUsers: stats.total, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  } catch (err) {
    console.warn('[signup-alert] could not count users', err?.message);
  }

  const msg = renderSignupEmail({
    displayName: userRecord.displayName || '',
    maskedEmail: maskEmail(userRecord.email),
    method: signInMethodLabel(providerOf(userRecord, decoded)),
    exam: hints.exam || null,
    country,
    locale: hints.locale || null,
    timeZone: hints.timeZone || null,
    createdAt: new Date(created),
    total: stats.total,
    today: stats.today,
    via
  });
  const r = await sendImpl({ to: alertRecipient(), from: alertSender(), idempotencyKey: `signup-${userRecord.uid}`, ...msg });
  if (!r.ok) {
    await ref.delete().catch(() => {});
    return { status: r.skipped === 'not-configured' ? 'not-configured' : 'failed' };
  }
  await ref.set({ sentAt: FieldValue.serverTimestamp(), emailId: r.id || null }, { merge: true }).catch(() => {});
  console.log(`[signup-alert] sent (${via})`);
  return { status: 'sent', id: r.id };
}

/**
 * Nightly backstop: alert for registered accounts created in the last SWEEP_WINDOW_MS that have
 * no claim doc yet (at most SWEEP_MAX per run). Never throws.
 */
export async function sweepMissedSignups({ now = new Date(), deadline = Date.now() + 60000, listPage } = {}) {
  const out = { candidates: 0, sent: 0, skipped: 0, failed: 0 };
  if (!process.env.RESEND_API_KEY) return { ...out, skipped: 'not-configured' };
  try {
    const list = listPage || ((max, token) => getAuth().listUsers(max, token));
    const fresh = [];
    let pageToken;
    do {
      const page = await list(1000, pageToken);
      for (const u of page?.users || []) {
        if (isAnonymousUser(u)) continue;
        const created = Date.parse(u.metadata?.creationTime || '');
        if (Number.isFinite(created) && now.getTime() - created <= SWEEP_WINDOW_MS) fresh.push(u);
      }
      pageToken = page?.pageToken;
    } while (pageToken && Date.now() < deadline);
    fresh.sort((a, b) => Date.parse(a.metadata.creationTime) - Date.parse(b.metadata.creationTime));
    for (const u of fresh) {
      if (out.sent + out.failed >= SWEEP_MAX || Date.now() > deadline) break;
      const exists = (await claimRef(u.uid).get()).exists;
      if (exists) continue;
      out.candidates++;
      const r = await notifySignup({ userRecord: u, via: 'daily-sweep', now });
      if (r.status === 'sent') out.sent++;
      else if (r.status === 'failed') out.failed++;
      else out.skipped++;
    }
  } catch (err) {
    console.error('[signup-alert] sweep failed', err?.message);
    out.error = err?.message || 'failed';
  }
  return out;
}
