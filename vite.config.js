import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import blogPlugin from './scripts/vite-plugin-blog.js';

/**
 * Microsoft Clarity project id (heatmaps and session recordings).
 * Override with VITE_CLARITY_PROJECT_ID. An explicit empty value turns Clarity off.
 * This is the only copy of the default id; index.html receives it as meta[name="oeh-clarity-id"].
 */
export const CLARITY_PROJECT_ID_DEFAULT = 'zk5viik44t';

export function clarityProjectId(mode, env = process.env) {
  const fileEnv = loadEnv(mode, process.cwd(), 'VITE_');
  const raw = Object.prototype.hasOwnProperty.call(env, 'VITE_CLARITY_PROJECT_ID')
    ? env.VITE_CLARITY_PROJECT_ID
    : fileEnv.VITE_CLARITY_PROJECT_ID;
  if (raw === undefined) return CLARITY_PROJECT_ID_DEFAULT;
  return String(raw).trim();
}

/** Writes the resolved id into the consent meta tag (dev and production HTML). */
export function clarityIdPlugin(id) {
  const raw = String(id || '');
  const safe = /^[a-z0-9]{0,32}$/.test(raw) ? raw : '';
  const tag = `<meta name="oeh-clarity-id" content="${safe}" />`;
  return {
    name: 'oeh-clarity-id',
    transformIndexHtml(html) {
      if (/<meta name="oeh-clarity-id"/.test(html)) {
        return html.replace(/<meta name="oeh-clarity-id" content="[^"]*"\s*\/?>/, tag);
      }
      return html.replace('<meta name="oeh-ga-id"', `${tag}\n    <meta name="oeh-ga-id"`);
    }
  };
}

// `npm run dev` proxies /api to the local API server (`npm run dev:api`, port 3001).
export default defineConfig(({ mode }) => {
  const clarityId = clarityProjectId(mode);
  return {
    plugins: [react(), clarityIdPlugin(clarityId), blogPlugin()],
    server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
    build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 }
  };
});
