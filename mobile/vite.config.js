import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '..');

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@hub': repo } },
  server: { fs: { allow: [repo] } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2500 }
});
