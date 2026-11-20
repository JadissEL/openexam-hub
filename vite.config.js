import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import blogPlugin from './scripts/vite-plugin-blog.js';

// `npm run dev` proxies /api to the local API server (`npm run dev:api`, port 3001).
export default defineConfig({
  plugins: [react(), blogPlugin()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 }
});
