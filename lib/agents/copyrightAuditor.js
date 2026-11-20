/**
 * Copyright / access auditor — deterministic, NO LLM.
 *
 * A candidate resource passes only when ALL of these hold:
 *   1. its URL is on the official allowlist (isOfficialUrl),
 *   2. checkLink() really reached it: status 'ok', or 'unverified' (site exists but blocks bots),
 *   3. for 'ok' pages, the fetched HTML shows no strong paywall / login-wall signal
 *      (and the link did not redirect to a login URL).
 *
 * The license label is assigned by rule from the hostname, never taken from a model.
 *
 * @module lib/agents/copyrightAuditor
 */
import { isOfficialUrl, normalizeUrl } from '../allowlist.js';
import { checkLink } from '../linkCheck.js';

/** Hosts run by the exam boards themselves (or their official co-owners). */
export const EXAM_BOARD_DOMAINS = [
  'france-education-international.fr',
  'ielts.org',
  'cambridgeenglish.org',
  'goethe.de',
  'britishcouncil.org'
];
export const LICENSE_EXAM_BOARD = 'Official exam-board page (free public access)';
export const LICENSE_PUBLIC = 'Public broadcaster / EU educational page (free access)';

const CONCURRENCY = 4;
const PAGE_TIMEOUT_MS = 8000;
const PAGE_MAX_BYTES = 600 * 1024;
const MAX_REDIRECTS = 4;
const UA = 'OpenExamHub-LinkChecker/1.0 (+https://github.com/JadissEL)';

const hostOf = (url) => new URL(url).hostname.toLowerCase().replace(/\.$/, '');
const onDomain = (host, d) => host === d || host.endsWith(`.${d}`);

/** Rule-based license label. Caller must already have checked isOfficialUrl(url). */
export function licenseFor(url) {
  const host = hostOf(url);
  return EXAM_BOARD_DOMAINS.some((d) => onDomain(host, d)) ? LICENSE_EXAM_BOARD : LICENSE_PUBLIC;
}

/**
 * Fetch an allowlisted page's HTML with a timeout and a byte cap. Redirects are followed
 * manually and every hop must stay on the allowlist (no SSRF / open proxy).
 * @param {string} url
 * @param {{maxBytes?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<{ok: boolean, html: string, finalUrl: string, httpCode: number|null, contentType: string, truncated: boolean, error?: string}>}
 */
export async function fetchPageHtml(url, { maxBytes = PAGE_MAX_BYTES, timeoutMs = PAGE_TIMEOUT_MS } = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isOfficialUrl(current)) return { ok: false, html: '', finalUrl: current, httpCode: null, contentType: '', truncated: false, error: 'off_allowlist' };
    let res;
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' }
      });
    } catch (err) {
      return { ok: false, html: '', finalUrl: current, httpCode: null, contentType: '', truncated: false, error: String(err?.name || 'fetch_error') };
    }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      await discard(res);
      current = new URL(loc, current).toString();
      continue;
    }
    const contentType = res.headers.get('content-type') || '';
    if (res.status < 200 || res.status >= 300) {
      await discard(res);
      return { ok: false, html: '', finalUrl: current, httpCode: res.status, contentType, truncated: false, error: `http_${res.status}` };
    }
    if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
      await discard(res);
      return { ok: true, html: '', finalUrl: current, httpCode: res.status, contentType, truncated: false };
    }
    try {
      const { text, truncated } = await readCapped(res, maxBytes);
      return { ok: true, html: text, finalUrl: current, httpCode: res.status, contentType, truncated };
    } catch (err) {
      return { ok: false, html: '', finalUrl: current, httpCode: res.status, contentType, truncated: false, error: String(err?.name || 'read_error') };
    }
  }
  return { ok: false, html: '', finalUrl: current, httpCode: null, contentType: '', truncated: false, error: 'too_many_redirects' };
}

async function readCapped(res, maxBytes) {
  if (!res.body?.getReader) {
    const t = await res.text();
    return { text: t.slice(0, maxBytes), truncated: t.length > maxBytes };
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= maxBytes) {
      truncated = true;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes)), truncated };
}

async function discard(res) {
  try { await res.body?.cancel(); } catch { /* ignore */ }
}

/** Strip scripts/styles/tags and decode common entities -> plain visible text. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|td|th|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&shy;/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
const safeChar = (n) => (Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ');

/** Page <title>, if any (used only as a display hint, never as a verification signal). */
export function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  const t = m ? htmlToText(m[1]).replace(/\s+/g, ' ').trim() : '';
  return t ? t.slice(0, 160) : null;
}

const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sso|connexion|se-connecter|anmelden|anmeldung)(\/|\?|$|\.)/i;
const ERROR_PATH = /\/(error|errors|404|not-?found|feedback\/status|status\/(?:404|error|other))(\/|\?|$|\.)/i;
const SOFT_404 = /\b(404|page not found|page introuvable|seite nicht gefunden|nicht gefunden|not found)\b/i;
const safePath = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return ''; } };
const PAYWALL_PHRASES = [
  /subscribe (now )?to (continue|read|keep reading|access|unlock)/i,
  /(sign|log) ?in to (continue|read|view|access|see this)/i,
  /(you must|please) (be )?(logged|signed) in to (view|access|see|read)/i,
  /this (content|article|page) is (only )?(available|reserved) (to|for) (subscribers|members)/i,
  /members[- ]only (content|area|page)/i,
  /continue reading with a subscription/i,
  /abonnez-vous pour (continuer|lire|acc[ée]der)/i,
  /r[ée]serv[ée]e? aux abonn[ée]s/i,
  /connectez-vous pour (continuer|acc[ée]der|lire|voir)/i,
  /nur f[üu]r abonnenten/i,
  /melden sie sich an,? um (weiterzulesen|fortzufahren|den inhalt)/i,
  /jetzt abonnieren,? um weiterzulesen/i
];
const PAYWALL_MARKUP = /class=["'][^"']*\b(paywall|piano-paywall|subscription-wall|regwall)\b/i;

/**
 * Detect strong paywall / login-wall signals in fetched HTML.
 * Deliberately conservative: a normal page that merely has a "Log in" link in the header passes.
 * @returns {string|null} rejection reason, or null when the page looks freely accessible.
 */
export function detectAccessWall(html, finalUrl = '') {
  try {
    if (finalUrl && LOGIN_PATH.test(new URL(finalUrl).pathname + new URL(finalUrl).search)) return 'redirects to a login page';
  } catch { /* ignore */ }
  if (!html) return null;
  if (PAYWALL_MARKUP.test(html)) return 'paywall markup detected';
  const text = htmlToText(html);
  for (const re of PAYWALL_PHRASES) {
    if (re.test(text)) return `paywall/login-wall text detected ("${(re.exec(text) || [''])[0].slice(0, 60)}")`;
  }
  // "Mostly a login form": a password field and almost no other visible text.
  const hasPassword = /<input\b[^>]*type=["']?password/i.test(html);
  if (hasPassword && text.length < 1500) return 'page is mostly a login form';
  return null;
}

/** Run `fn` over `items` with at most `limit` in flight. Preserves order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Audit one resource. Never throws.
 * @param {{url: string, title?: string}} r
 * @returns {Promise<{pass: true, resource: object} | {pass: false, url: string, reason: string, linkStatus?: string, httpCode?: number|null}>}
 */
export async function auditOne(r) {
  const url = typeof r?.url === 'string' ? r.url.trim() : '';
  try {
    if (!url || !isOfficialUrl(url)) return { pass: false, url, reason: 'not on the official domain allowlist' };
    const link = await checkLink(url);
    if (link.status !== 'ok' && link.status !== 'unverified') {
      return { pass: false, url, reason: `link check failed: ${link.status}${link.httpCode ? ` (HTTP ${link.httpCode})` : ''}`, linkStatus: link.status, httpCode: link.httpCode };
    }
    // Some sites answer HEAD with a redirect to an error/feedback page but serve GET normally
    // (seen on learngerman.dw.com), so the page is re-fetched with GET from the original URL and
    // the GET's final URL is what gets stored.
    let finalUrl = link.finalUrl && isOfficialUrl(link.finalUrl) && !ERROR_PATH.test(safePath(link.finalUrl)) ? normalizeUrl(link.finalUrl) : normalizeUrl(url);
    let title = null;
    let wall = null;
    let contentChecked = false;
    if (link.status === 'ok') {
      const page = await fetchPageHtml(url);
      if (page.ok) {
        if (ERROR_PATH.test(safePath(page.finalUrl))) return { pass: false, url, reason: 'redirects to an error page', linkStatus: link.status, httpCode: link.httpCode };
        finalUrl = normalizeUrl(page.finalUrl);
        contentChecked = Boolean(page.html);
        title = pageTitle(page.html);
        if (title && SOFT_404.test(title)) return { pass: false, url, reason: `soft 404 ("${title.slice(0, 60)}")`, linkStatus: 'dead', httpCode: page.httpCode };
        wall = detectAccessWall(page.html, page.finalUrl);
      } else if (page.httpCode === 404 || page.httpCode === 410) {
        return { pass: false, url, reason: `page fetch returned HTTP ${page.httpCode}`, linkStatus: 'dead', httpCode: page.httpCode };
      }
      // Other GET failures after a successful HEAD keep the HEAD verdict (content not inspected).
    }
    if (!wall) wall = detectAccessWall('', finalUrl);
    if (wall) return { pass: false, url, reason: wall, linkStatus: link.status, httpCode: link.httpCode };
    return {
      pass: true,
      resource: {
        ...r,
        url: finalUrl,
        license: licenseFor(finalUrl),
        linkStatus: link.status,
        httpCode: link.httpCode ?? null,
        pageTitle: title,
        contentChecked,
        checkedAt: new Date().toISOString()
      }
    };
  } catch (err) {
    return { pass: false, url, reason: `audit error: ${err?.message || 'unknown'}` };
  }
}

/**
 * Audit a list of candidate resources (concurrency 4). Never throws.
 * @param {Array<{url: string, title?: string, category?: string, skills?: string[], levels?: string[]}>} candidates
 * @returns {Promise<{passed: object[], rejected: Array<{url: string, reason: string, linkStatus?: string, httpCode?: number|null}>}>}
 *   passed items carry license (rule-based), linkStatus, httpCode, pageTitle, contentChecked, checkedAt.
 */
export async function auditResources(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const results = await mapLimit(list, CONCURRENCY, auditOne);
  const passed = [];
  const rejected = [];
  const seen = new Set();
  for (const r of results) {
    if (r.pass) {
      if (seen.has(r.resource.url)) continue; // two candidates redirected to the same page
      seen.add(r.resource.url);
      passed.push(r.resource);
    } else {
      rejected.push({ url: r.url, reason: r.reason, linkStatus: r.linkStatus ?? null, httpCode: r.httpCode ?? null });
    }
  }
  return { passed, rejected };
}
