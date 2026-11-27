// Offline tests for the Cloudflare Worker: /transparency and /tools 301s, and basic routing.
// No network. Run: node scripts/test-worker.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { ASSETLINKS } from '../lib/assetlinks.js';

const assets = new Map([
  ['/funding', '<html>funding</html>'],
  ['/blog', '<html>blog</html>'],
  ['/app', '<html>app</html>'],
  ['/tools/clb-converter', '<html>converter</html>']
]);

function env() {
  return {
    API_ORIGIN: 'https://openexam-hub.vercel.app',
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        const body = assets.get(url.pathname);
        if (body === undefined) return new Response('missing', { status: 404 });
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
      }
    }
  };
}

async function fetchPath(path, init = {}) {
  const request = new Request(`https://openexamhub.org${path}`, { method: 'GET', ...init });
  return worker.fetch(request, env());
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('/transparency 301-redirects to /funding', async () => {
  const res = await fetchPath('/transparency');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/funding');
});

test('/transparency/ 301-redirects to /funding', async () => {
  const res = await fetchPath('/transparency/');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/funding');
});

test('/transparency keeps the query string', async () => {
  const res = await fetchPath('/transparency?utm=books');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/funding?utm=books');
});

test('/funding is still served (no redirect loop)', async () => {
  const res = await fetchPath('/funding');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<html>funding</html>');
});

test('/tools 301-redirects to /tools/clb-converter', async () => {
  const res = await fetchPath('/tools');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/tools/clb-converter');
});

test('/tools/ 301-redirects to /tools/clb-converter', async () => {
  const res = await fetchPath('/tools/');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/tools/clb-converter');
});

test('/tools keeps the query string, including ?tab=', async () => {
  const res = await fetchPath('/tools?tab=ielts');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/tools/clb-converter?tab=ielts');
});

test('/tools/clb-converter is still served (no redirect loop)', async () => {
  const res = await fetchPath('/tools/clb-converter?tab=ielts');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<html>converter</html>');
});

test('/.well-known/assetlinks.json names the Android package and matches the static file', async () => {
  const res = await fetchPath('/.well-known/assetlinks.json');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = JSON.parse(await res.text());
  assert.deepEqual(body, ASSETLINKS);
  assert.equal(body[0].target.package_name, 'org.openexamhub.app');
  assert.equal(body[0].target.sha256_cert_fingerprints.length, 1);
  const disk = JSON.parse(readFileSync(new URL('../public/.well-known/assetlinks.json', import.meta.url), 'utf8'));
  assert.deepEqual(disk, ASSETLINKS);
});

test('/app-ads.txt is proxied to the ads.txt handler', async () => {
  const orig = globalThis.fetch;
  let seen = '';
  globalThis.fetch = async (url) => {
    seen = String(url);
    return new Response('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  };
  try {
    const res = await fetchPath('/app-ads.txt');
    assert.equal(res.status, 200);
    assert.equal(seen, 'https://openexam-hub.vercel.app/api/ads-txt');
    assert.match(await res.text(), /^google\.com, pub-1234567890123456, DIRECT,/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('unknown paths stay 404', async () => {
  const res = await fetchPath('/no-such-page');
  assert.equal(res.status, 404);
});

test('www host 308-redirects to the apex over https', async () => {
  const request = new Request('https://www.openexamhub.org/app?exam=TCF', { method: 'GET' });
  const res = await worker.fetch(request, env());
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/app?exam=TCF');
});

test('http on the apex 301-redirects to https', async () => {
  const request = new Request('http://openexamhub.org/app?exam=TCF', { method: 'GET' });
  const res = await worker.fetch(request, env());
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/app?exam=TCF');
});

test('http on www 308-redirects to the https apex in one hop', async () => {
  const request = new Request('http://www.openexamhub.org/faq', { method: 'GET' });
  const res = await worker.fetch(request, env());
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://openexamhub.org/faq');
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(err);
  }
}
if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log(`${tests.length} worker tests passed`);
