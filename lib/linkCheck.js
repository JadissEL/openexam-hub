import { isOfficialUrl } from './allowlist.js';
import { Agent, fetch as undiciFetch } from 'undici';

const TIMEOUT_MS = 20000; // 20s: large official PDFs (e.g. celpip.ca) were flagged at 8s
const MAX_REDIRECTS = 4;
// ETS (and a few other official sites) send a very large Content-Security-Policy
// header. Node's default max header size is 16 KB and fails with UND_ERR_HEADERS_OVERFLOW.
const dispatcher = new Agent({ maxHeaderSize: 64 * 1024 });

/**
 * Really requests the URL. Redirects are followed manually so every hop must
 * stay on the allowlist (also prevents using this as an open proxy / SSRF).
 * Returns { status: 'ok' | 'dead' | 'unverified' | 'off_allowlist' | 'error', httpCode, finalUrl }
 *  - ok:          2xx reached
 *  - dead:        404 / 410 / DNS failure
 *  - unverified:  site answered but blocked automated checks (401/403/429) — exists, not confirmed
 *  - error:       timeout or 5xx
 */
export async function checkLink(url) {
  if (!isOfficialUrl(url)) return { status: 'off_allowlist', httpCode: null, finalUrl: url };
  const first = await checkOnce(url);
  // Some official hosts (notably RFI) treat /path and /path/ as different pages.
  // If the slash-stripped form 404s, retry once with a trailing slash.
  if (first.status === 'dead' && first.httpCode === 404) {
    const slashed = withTrailingSlash(url);
    if (slashed !== url && isOfficialUrl(slashed)) {
      const retry = await checkOnce(slashed);
      if (retry.status === 'ok' || retry.status === 'unverified') return retry;
    }
  }
  return first;
}

async function checkOnce(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      // GET, not HEAD: some official sites (e.g. learngerman.dw.com) answer HEAD with a bogus error redirect.
      res = await officialFetch(current, { method: 'GET', timeoutMs: TIMEOUT_MS });
      res.body?.cancel?.().catch?.(() => {});
    } catch (err) {
      const dns = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(String(err?.cause?.code || err?.message));
      return { status: dns ? 'dead' : 'error', httpCode: null, finalUrl: current };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      if (!isOfficialUrl(next)) return { status: 'off_allowlist', httpCode: res.status, finalUrl: next };
      current = next;
      continue;
    }
    const code = res.status;
    if (code >= 200 && code < 300) return { status: 'ok', httpCode: code, finalUrl: current };
    if (code === 404 || code === 410) return { status: 'dead', httpCode: code, finalUrl: current };
    if (code === 401 || code === 403 || code === 429) return { status: 'unverified', httpCode: code, finalUrl: current };
    return { status: 'error', httpCode: code, finalUrl: current };
  }
  return { status: 'error', httpCode: null, finalUrl: current };
}

function withTrailingSlash(url) {
  try {
    const u = new URL(url);
    if (u.pathname.length > 1 && !u.pathname.endsWith('/')) {
      u.pathname += '/';
      return u.toString();
    }
  } catch { /* ignore */ }
  return url;
}

/** Allowlisted GET/HEAD with a raised header-size cap. Used by the auditor too. */
export async function officialFetch(url, { method = 'GET', timeoutMs = TIMEOUT_MS, headers = {} } = {}) {
  const opts = {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'OpenExamHub-LinkChecker/1.0 (+https://github.com/JadissEL)', ...headers }
  };
  try {
    // Prefer global fetch so unit tests can stub it.
    return await fetch(url, opts);
  } catch (err) {
    const overflow = /HEADERS_OVERFLOW|UND_ERR_HEADERS/i.test(String(err?.cause?.code || err?.message || err));
    if (!overflow) throw err;
    return undiciFetch(url, { ...opts, dispatcher });
  }
}
