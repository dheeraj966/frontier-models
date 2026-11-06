import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import type { AppContext } from './context';
import { EventBus } from './events';
import { startScheduler } from './scheduler';
import { sources } from './sources';
import { CsvStore } from './store';

const cfg = loadConfig();
const store = new CsvStore(cfg.dataDir);
store.closeStaleRuns();

const ctx: AppContext = { store, cfg, bus: new EventBus(), sources, fetchImpl: fetch };
const app = createApp(ctx);

if (cfg.serveStatic) {
  const dist = resolve('dist');
  if (!existsSync(dist)) {
    console.warn('[server] --serve-static given but ./dist is missing — run `npm run build` first.');
  } else {
    app.use(
      '/assets/*',
      serveStatic({ root: './dist', onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }),
    );
    app.use('*', serveStatic({ root: './dist' }));
    // SPA fallback; read per request so a rebuild never serves stale asset hashes.
    app.get('*', (c) => c.html(readFileSync(resolve(dist, 'index.html'), 'utf8')));
  }
}

const scheduler = startScheduler(ctx);

const server = serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  const live = sources.filter((s) => s.isConfigured(cfg)).map((s) => s.label);
  console.log(`[server] http://localhost:${info.port}  ·  data ${cfg.dataDir}`);
  console.log(`[server] live sources: ${live.length ? live.join(', ') : 'none (CSV data only — set AA_API_KEY in .env)'}`);
  if (cfg.refreshHours > 0 && live.length) console.log(`[server] auto-refresh every ${cfg.refreshHours} h`);
});

const shutdown = () => {
  scheduler.stop();
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
