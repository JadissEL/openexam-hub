// Unit tests for the /app email form pre-check (src/authForm.js). These must reject
// invalid emails and short passwords before any Firebase Auth call is made.
import assert from 'node:assert/strict';
import { authFormError, EMAIL_PATTERN, MIN_PASSWORD_LENGTH } from '../src/authForm.js';

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

test('password minimum is 6 characters, matching Firebase Auth', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
});

test('empty email is rejected in every mode', () => {
  for (const mode of ['signup', 'login', 'reset']) {
    assert.deepEqual(authFormError({ email: '', password: 'abcdef', mode }), {
      field: 'email',
      message: 'Please enter your email address.'
    });
    assert.deepEqual(authFormError({ email: '   ', password: 'abcdef', mode }), {
      field: 'email',
      message: 'Please enter your email address.'
    });
  }
});

test('invalid emails (including the QA case "abc") never pass', () => {
  const bad = ['abc', 'abc@', '@x.com', 'a@b', 'a@b.', 'not an email', 'foo@bar com'];
  for (const email of bad) {
    for (const mode of ['signup', 'login', 'reset']) {
      const issue = authFormError({ email, password: 'abcdef', mode });
      assert.equal(issue?.field, 'email', `${email} in ${mode}`);
      assert.equal(issue.message, 'Please enter a valid email address.');
      assert.equal(EMAIL_PATTERN.test(email), false);
    }
  }
});

test('valid emails are accepted; surrounding spaces are trimmed', () => {
  const issue = authFormError({ email: '  student@example.com  ', password: 'abcdef', mode: 'signup' });
  assert.equal(issue, null);
  assert.equal(EMAIL_PATTERN.test('student@example.com'), true);
});

test('signup and login reject a missing or short password (QA case: 3 characters)', () => {
  for (const mode of ['signup', 'login']) {
    assert.deepEqual(authFormError({ email: 'student@example.com', password: '', mode }), {
      field: 'password',
      message: 'Please enter your password.'
    });
    assert.deepEqual(authFormError({ email: 'student@example.com', password: 'abc', mode }), {
      field: 'password',
      message: 'Please use a password with at least 6 characters.'
    });
    assert.deepEqual(authFormError({ email: 'student@example.com', password: '12345', mode }), {
      field: 'password',
      message: 'Please use a password with at least 6 characters.'
    });
  }
});

test('signup and login accept a 6-character password', () => {
  for (const mode of ['signup', 'login']) {
    assert.equal(authFormError({ email: 'student@example.com', password: 'abcdef', mode }), null);
  }
});

test('password reset only checks the email, not the password', () => {
  assert.equal(authFormError({ email: 'student@example.com', password: '', mode: 'reset' }), null);
  assert.equal(authFormError({ email: 'student@example.com', password: 'abc', mode: 'reset' }), null);
  assert.deepEqual(authFormError({ email: 'abc', password: '', mode: 'reset' }), {
    field: 'email',
    message: 'Please enter a valid email address.'
  });
});

test('an invalid email is reported before a short password', () => {
  assert.deepEqual(authFormError({ email: 'abc', password: 'abc', mode: 'signup' }), {
    field: 'email',
    message: 'Please enter a valid email address.'
  });
});

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nauth-gate tests passed');
