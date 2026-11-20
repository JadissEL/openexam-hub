#!/usr/bin/env node
// Build dist/ for Cloudflare Workers Static Assets: the same production build Vercel runs
// (VERCEL_ENV=production so blog drafts are excluded), plus dist/_headers mirroring vercel.json.
// VITE_ADSENSE_CLIENT must be set in the environment, as it is on Vercel.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

if (!process.env.VITE_ADSENSE_CLIENT) console.warn('cf-build: VITE_ADSENSE_CLIENT is not set; the dashboard ad slot will be off.');
execSync('npm run build', { stdio: 'inherit', env: { ...process.env, VERCEL_ENV: 'production' } });

writeFileSync(
  'dist/_headers',
  `/*
  Strict-Transport-Security: max-age=63072000
  Access-Control-Allow-Origin: *

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/demo/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/demo/desktop.vtt
  Content-Type: text/vtt; charset=utf-8

/robots.txt
  Content-Type: text/plain; charset=utf-8

/llms.txt
  Content-Type: text/plain; charset=utf-8

/site.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
`
);
console.log('cf-build: wrote dist/_headers');
