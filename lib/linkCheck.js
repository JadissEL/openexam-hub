import { isOfficialUrl } from './allowlist.js';

const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;

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
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      // GET, not HEAD: some official sites (e.g. learngerman.dw.com) answer HEAD with a bogus error redirect.
      res = await request(current, 'GET');
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

async function request(url, method) {
  return fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'OpenExamHub-LinkChecker/1.0 (+https://github.com/JadissEL)' }
  });
}
