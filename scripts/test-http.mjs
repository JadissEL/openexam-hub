import assert from 'node:assert/strict';
import { allowedOrigin } from '../lib/http.js';
import { adsTxtBody } from '../lib/routes/ads-txt.js';

const list = 'https://openexamhub.org, https://www.openexamhub.org,https://openexam-hub.vercel.app';
assert.equal(allowedOrigin('https://openexamhub.org', list), 'https://openexamhub.org');
assert.equal(allowedOrigin('https://www.openexamhub.org', list), 'https://www.openexamhub.org');
assert.equal(allowedOrigin('https://openexam-hub.vercel.app', list), 'https://openexam-hub.vercel.app');
assert.equal(allowedOrigin('https://evil.example', list), 'https://openexamhub.org');
assert.equal(allowedOrigin(undefined, list), 'https://openexamhub.org');
assert.equal(allowedOrigin('https://x.example', ''), '*');
assert.equal(allowedOrigin('https://x.example', '*'), '*');

assert.equal(adsTxtBody(''), null);
assert.equal(adsTxtBody('pub-XXXX'), null);
assert.equal(adsTxtBody('pub-1234567890123456'), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
assert.equal(adsTxtBody('ca-pub-1234567890123456'), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
console.log('http + ads.txt tests passed');
