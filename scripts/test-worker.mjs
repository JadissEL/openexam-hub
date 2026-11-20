// Offline tests for the Cloudflare Worker: /transparency 301 and basic routing.
// No network. Run: node scripts/test-worker.mjs
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const assets = new Map([
  ['/funding', '<html>funding</html>'],
  ['/blog', '<html>blog</html>'],
  ['/app', '<html>app</html>']
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

test('unknown paths stay 404', async () => {
  const res = await fetchPath('/no-such-page');
  assert.equal(res.status, 404);
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
