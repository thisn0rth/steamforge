import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.STREAMFORGE_SERVER ?? 'http://127.0.0.1:4500';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@streamforge/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': SERVER,
      '/gsi': SERVER,
      '/ws': { target: SERVER, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
