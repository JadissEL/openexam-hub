#!/usr/bin/env node
/**
 * Browser E2E for the /app auth gate (Playwright, headless Chromium).
 *
 *   npm run e2e:gate                                  signed-out checks against https://openexamhub.org
 *   BASE_URL=http://127.0.0.1:4173 npm run e2e:gate   ... against a local `vite preview`
 *   E2E_EMULATOR=1 npm run e2e:gate                   also the signed-in path: builds the app against the
 *                                                     Firebase Auth + Firestore emulators (project demo-openexam),
 *                                                     signs up a throwaway emulator user, checks the dashboard
 *                                                     opens with ?exam=, signs out, checks the gate is back.
 *
 * Signed-out checks never create accounts. The signed-in path only ever talks to the emulators.
 * Screenshots go to SHOTS_DIR (default ./e2e-shots).
 */
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.resolve(process.env.SHOTS_DIR || path.join(ROOT, 'e2e-shots'));
mkdirSync(SHOTS, { recursive: true });
const EMULATOR = process.env.E2E_EMULATOR === '1';
const PROJECT = 'demo-openexam';

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1366, height: 900 } }
};

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(err && err.message).split('\n')[0]}`);
  }
}

/** The dashboard must not be in the DOM: no tab bar, no Welcome card, no ad slot. */
async function assertNoDashboard(page) {
  assert.equal(await page.getByRole('button', { name: /^Your account$/ }).count(), 0, 'account button rendered');
  assert.equal(await page.getByText(/^Welcome( back)?/).count(), 0, 'Welcome card rendered');
  assert.equal(await page.getByText('Which exam?').count(), 0, 'planner rendered');
  assert.equal(await page.locator('nav >> text=Library').count(), 0, 'tab bar rendered');
  assert.equal(await page.locator('ins.adsbygoogle').count(), 0, 'ad slot rendered');
}

async function signedOutChecks(browser, base) {
  for (const [vp, opts] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const apiCalls = [];
    page.on('request', (r) => {
      if (/\/api\/|firestore\.googleapis|googlesyndication/.test(r.url())) apiCalls.push(r.url());
    });

    await check(`${vp}: /app shows only the gate`, async () => {
      await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('auth-gate').waitFor({ timeout: 15000 });
      await page.getByRole('heading', { name: 'Create your free account' }).waitFor();
      await page.getByRole('tab', { name: 'Log in' }).waitFor();
      await page.getByRole('button', { name: /Continue with Google/ }).waitFor();
      await assertNoDashboard(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp}-app-gate.png`), fullPage: true });
    });

    await check(`${vp}: no dashboard data fetches or ad requests while signed out`, async () => {
      assert.deepEqual(apiCalls.filter((u) => !/securetoken|identitytoolkit/.test(u)), []);
    });

    await check(`${vp}: cookie banner never blocks the sign-up button`, async () => {
      await page.getByRole('button', { name: 'Create free account' }).click({ trial: true, timeout: 5000 });
    });

    await check(`${vp}: plan preview works without an account`, async () => {
      await page.getByTestId('open-plan-preview').click();
      await page.getByTestId('plan-preview').waitFor();
      await page.getByRole('button', { name: 'Preview this plan' }).click();
      await page.locator('[data-testid="plan-preview-result"], [data-testid="plan-preview-miss"]').first().waitFor({ timeout: 20000 });
      await assertNoDashboard(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp}-app-plan-preview.png`), fullPage: true });
      await page.getByRole('button', { name: 'Back to sign up' }).click();
      await page.getByRole('heading', { name: 'Create your free account' }).waitFor();
    });

    await check(`${vp}: log-in tab and password reset`, async () => {
      await page.getByRole('tab', { name: 'Log in' }).click();
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await page.getByRole('button', { name: 'Forgot your password?' }).click();
      await page.getByRole('button', { name: 'Send reset link' }).waitFor();
      await page.screenshot({ path: path.join(SHOTS, `${vp}-app-gate-reset.png`), fullPage: true });
      await page.getByRole('button', { name: 'Back to log in' }).click();
    });

    await check(`${vp}: sample plan is read-only and has no dashboard tabs`, async () => {
      await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'See a sample TEF Canada plan' }).click();
      await page.getByTestId('sample-plan').waitFor();
      await assertNoDashboard(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp}-app-sample.png`), fullPage: true });
    });

    await check(`${vp}: /app?exam=IELTS shows the gate and names the exam`, async () => {
      await page.goto(`${base}/app?exam=IELTS&level=C1`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('auth-gate').waitFor({ timeout: 15000 });
      await page.getByText(/planner for IELTS/).waitFor();
      await assertNoDashboard(page);
      assert.match(page.url(), /\?exam=IELTS&level=C1$/);
      await page.screenshot({ path: path.join(SHOTS, `${vp}-app-ielts-gate.png`), fullPage: true });
    });

    await check(`${vp}: /app#transparency signed out goes to /funding`, async () => {
      await page.goto(`${base}/app#transparency`);
      await page.waitForURL(/\/funding$/, { timeout: 15000 });
    });

    await check(`${vp}: landing CTA opens the gate`, async () => {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.locator('a:visible', { hasText: 'Build my free plan' }).first().click();
      await page.getByTestId('auth-gate').waitFor({ timeout: 15000 });
      await assertNoDashboard(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp}-landing-cta-gate.png`), fullPage: true });
    });

    await ctx.close();
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function waitHttp(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function emulatorChecks(browser) {
  const env = { ...process.env, GCLOUD_PROJECT: PROJECT };
  for (const k of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS']) delete env[k];
  const emu = spawn('npx', ['firebase', 'emulators:start', '--only', 'auth,firestore', '--project', PROJECT, '--config', 'firebase.json'], {
    cwd: ROOT,
    env,
    stdio: 'ignore'
  });
  let preview;
  try {
    await waitHttp('http://127.0.0.1:9099/');
    await waitHttp('http://127.0.0.1:8085/');
    const outDir = 'dist-e2e';
    execFileSync('npx', ['vite', 'build', '--outDir', outDir], {
      cwd: ROOT,
      stdio: 'ignore',
      env: {
        ...env,
        VITE_FIREBASE_EMULATORS: 'true',
        VITE_FIREBASE_PROJECT_ID: PROJECT,
        VITE_FIREBASE_API_KEY: 'demo-key',
        VITE_FIREBASE_AUTH_DOMAIN: '127.0.0.1',
        VITE_SERVER_ENABLED: 'false'
      }
    });
    preview = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', '4179', '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
    const base = 'http://127.0.0.1:4179';
    await waitHttp(`${base}/`);

    const ctx = await browser.newContext(VIEWPORTS.mobile);
    const page = await ctx.newPage();
    const email = `gate-${Date.now()}@example.test`;

    await check('emulator: sign up from /app?exam=IELTS opens the dashboard with IELTS selected', async () => {
      await page.goto(`${base}/app?exam=IELTS&level=C1`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('auth-gate').waitFor({ timeout: 20000 });
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('e2e-gate-password');
      await page.getByRole('button', { name: 'Create free account' }).click();
      await page.getByText('Which exam?').waitFor({ timeout: 20000 });
      assert.equal(await page.getByTestId('auth-gate').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'IELTS', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'C1', exact: true }).first().getAttribute('aria-pressed'), 'true');
      await page.screenshot({ path: path.join(SHOTS, 'emulator-mobile-dashboard-ielts.png'), fullPage: false });
    });

    await check('emulator: sign out returns to the gate', async () => {
      await page.getByRole('button', { name: 'Your account' }).first().click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.getByTestId('auth-gate').waitFor({ timeout: 15000 });
      await assertNoDashboard(page);
    });

    await check('emulator: log in again reaches the dashboard', async () => {
      await page.getByRole('tab', { name: 'Log in' }).click();
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('e2e-gate-password');
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await page.getByText('Which exam?').waitFor({ timeout: 20000 });
      await page.screenshot({ path: path.join(SHOTS, 'emulator-mobile-dashboard-after-login.png'), fullPage: false });
    });

    await check('emulator: wrong password shows a friendly error', async () => {
      await page.getByRole('button', { name: 'Your account' }).first().click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.getByRole('tab', { name: 'Log in' }).click();
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill('wrong-password');
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await page.getByRole('alert').waitFor({ timeout: 15000 });
    });
    await ctx.close();
  } finally {
    if (preview) preview.kill();
    emu.kill('SIGINT');
    await wait(1500);
  }
}

const browser = await chromium.launch();
try {
  const base = (process.env.BASE_URL || 'https://openexamhub.org').replace(/\/+$/, '');
  console.log(`signed-out gate checks against ${base}`);
  await signedOutChecks(browser, base);
  if (EMULATOR) {
    console.log('signed-in path on the Firebase emulators (demo-openexam)');
    await emulatorChecks(browser);
  }
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? `: ${failures.join('; ')}` : ''}`);
console.log(`screenshots: ${SHOTS}`);
process.exit(failures.length ? 1 : 0);
