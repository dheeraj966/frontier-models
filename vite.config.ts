/// <reference types="vitest/config" />
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 8787}`;

/** GitHub Pages serves 404.html for unknown paths — make it the app shell so deep links work. */
const spaFallback = (): Plugin => ({
  name: 'spa-404-fallback',
  apply: 'build',
  closeBundle() {
    const index = resolve('dist/index.html');
    if (existsSync(index)) copyFileSync(index, resolve('dist/404.html'));
  },
});

export default defineConfig({
  plugins: [react(), spaFallback()],
  // Set BASE_PATH=/repo-name/ when hosting under a sub-path (the Pages workflow does this).
  base: process.env.BASE_PATH ?? '/',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  server: {
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
  build: {
    // Vite 8 bundles with Rolldown: chunk groups replace Rollup's `manualChunks`.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory-vendor|decimal\.js|eventemitter3|lodash)/ },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['src/lib/**', 'src/utils/**', 'server/**'],
      exclude: ['**/*.test.ts', 'server/index.ts', 'server/cli/**'],
    },
  },
});
