import assert from 'node:assert/strict';
import { accountChipLabel, accountDisplayName } from '../src/accountLabel.js';
import { DEFAULT_API_TIMEOUT_MS, requestSignal } from '../src/requestSignal.js';

assert.equal(DEFAULT_API_TIMEOUT_MS, 60_000);

assert.equal(accountDisplayName({ displayName: 'Jadiss EL ANTAKI', email: 'a@example.com' }), 'Jadiss EL ANTAKI');
assert.equal(accountDisplayName({ displayName: '  ', email: 'a@example.com' }), 'a@example.com');
assert.equal(accountDisplayName({ email: 'a@example.com' }), 'a@example.com');
assert.equal(accountDisplayName({ displayName: '', email: '' }), 'Member');
assert.equal(accountDisplayName({}), 'Member');
assert.equal(accountDisplayName(null), 'Member');
assert.equal(accountChipLabel({ email: 'a@example.com' }), 'Your account, a@example.com');
assert.equal(accountChipLabel(null), 'Your account, Member');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const timedOut = requestSignal({ timeoutMs: 20 });
assert.equal(timedOut.aborted, false);
await wait(60);
assert.equal(timedOut.aborted, true, 'timeout signal should abort after timeoutMs');

const caller = new AbortController();
const combined = requestSignal({ signal: caller.signal, timeoutMs: 5_000 });
assert.equal(combined.aborted, false);
caller.abort();
assert.equal(combined.aborted, true, 'combined signal should abort when the caller aborts');

const already = new AbortController();
already.abort();
const fromAborted = requestSignal({ signal: already.signal, timeoutMs: 5_000 });
assert.equal(fromAborted.aborted, true, 'already-aborted caller signal should abort immediately');

const noTimeout = requestSignal({ signal: new AbortController().signal, timeoutMs: 0 });
assert.equal(noTimeout.aborted, false);

async function withMissingAbortHelpers(fn) {
  const origTimeout = AbortSignal.timeout;
  const origAny = AbortSignal.any;
  AbortSignal.timeout = undefined;
  AbortSignal.any = undefined;
  try {
    assert.notEqual(typeof AbortSignal.timeout, 'function');
    assert.notEqual(typeof AbortSignal.any, 'function');
    await fn();
  } finally {
    AbortSignal.timeout = origTimeout;
    AbortSignal.any = origAny;
  }
}

await withMissingAbortHelpers(async () => {
  const fallbackTimeout = requestSignal({ timeoutMs: 20 });
  assert.equal(fallbackTimeout.aborted, false);
  await wait(60);
  assert.equal(fallbackTimeout.aborted, true, 'manual timeout fallback should abort after timeoutMs');

  const fallbackCaller = new AbortController();
  const fallbackCombined = requestSignal({ signal: fallbackCaller.signal, timeoutMs: 5_000 });
  assert.equal(fallbackCombined.aborted, false);
  fallbackCaller.abort();
  assert.equal(fallbackCombined.aborted, true, 'manual any-signal fallback should follow the caller');

  const pre = new AbortController();
  pre.abort();
  assert.equal(requestSignal({ signal: pre.signal, timeoutMs: 5_000 }).aborted, true);
});

console.log('client helper tests passed');
