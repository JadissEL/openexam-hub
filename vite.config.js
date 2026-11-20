import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` proxies /api to the local API server (`npm run dev:api`, port 3001).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 }
});
