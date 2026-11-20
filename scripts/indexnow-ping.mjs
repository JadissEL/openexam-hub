#!/usr/bin/env node
// Tell IndexNow (Bing, Yandex, Seznam, Naver...) about every URL in the live sitemap.
// Runs after each Cloudflare deploy (.github/workflows/cloudflare-deploy.yml) and by hand with
// `npm run indexnow`. The key is public by design: IndexNow checks that
// https://openexamhub.org/<key>.txt contains it, which proves we own the host.
// Exit code is 0 even when the ping fails, so a search-engine hiccup never fails a deploy.
const HOST = 'openexamhub.org';
const ORIGIN = `https://${HOST}`;
const KEY = '5d0470cb7316d5e427e114af25625df2';
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

async function main() {
  const keyRes = await fetch(KEY_LOCATION, { cache: 'no-store' });
  const keyText = keyRes.ok ? (await keyRes.text()).trim() : '';
  if (keyText !== KEY) {
    console.warn(`indexnow: ${KEY_LOCATION} answered ${keyRes.status} without the key; skipping the ping.`);
    return;
  }
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`, { cache: 'no-store' })).text();
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => u.startsWith(`${ORIGIN}/`) || u === ORIGIN);
  if (!urlList.length) {
    console.warn('indexnow: the sitemap has no URLs; skipping the ping.');
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urlList.slice(0, 10000) })
  });
  const body = (await res.text()).slice(0, 300);
  // 200 = accepted, 202 = accepted while the key is being validated.
  console.log(`indexnow: submitted ${urlList.length} URL(s), HTTP ${res.status}${body ? ` ${body}` : ''}`);
}

main().catch((err) => console.warn(`indexnow: ping failed: ${err && err.message}`));
