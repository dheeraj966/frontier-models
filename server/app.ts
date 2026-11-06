import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createHash } from 'node:crypto';
import type { AppContext } from './context';
import { buildDataset, datasetCsv, sourceInfo } from './dataset';
import { runIngest } from './ingest';
import { openapi } from './openapi';

const MANUAL_COOLDOWN_MS = 2 * 60_000;

/** The HTTP API. Exported separately from the server so tests can call app.request(). */
export function createApp(ctx: AppContext) {
  const app = new Hono();
  let lastManual = 0;
  const { store } = ctx;

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Access-Control-Allow-Origin', '*');
  });

  app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString(), dataDir: ctx.cfg.dataDir }));
  app.get('/api/openapi.json', (c) => c.json(openapi));

  app.get('/api/dataset', (c) => {
    const body = JSON.stringify(buildDataset(ctx));
    // ETag ignores volatile timestamps so unchanged data → 304.
    const stable = body.replace(/"generatedAt":"[^"]*"/, '').replace(/"updatedAt":"[^"]*"/g, '');
    const etag = `W/"${createHash('sha1').update(stable).digest('base64url').slice(0, 20)}"`;
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
    c.header('ETag', etag);
    c.header('Cache-Control', 'no-cache');
    return c.body(body, 200, { 'Content-Type': 'application/json; charset=utf-8' });
  });

  app.get('/api/models', (c) => {
    store.refresh();
    return c.json(store.data.models);
  });
  app.get('/api/benchmarks', (c) => {
    store.refresh();
    return c.json(store.data.benchmarks);
  });
  app.get('/api/scores', (c) => {
    store.refresh();
    return c.json(store.currentScores());
  });

  app.get('/api/models/:id', (c) => {
    store.refresh();
    const id = c.req.param('id');
    const model = store.data.models.find((m) => m.id === id);
    if (!model) return c.json({ error: 'Model not found' }, 404);
    return c.json({ model, scores: store.currentScores().filter((s) => s.modelId === id), history: store.history(id) });
  });

  app.get('/api/models/:id/history', (c) => {
    store.refresh();
    const id = c.req.param('id');
    if (!store.data.models.some((m) => m.id === id)) return c.json({ error: 'Model not found' }, 404);
    return c.json(store.history(id));
  });

  app.get('/api/sources', (c) => c.json(sourceInfo(ctx)));
  app.get('/api/runs', (c) => c.json(store.runs(Math.min(200, Math.max(1, Number(c.req.query('limit')) || 20)))));
  app.get('/api/changes', (c) => {
    const limit = Math.min(1000, Math.max(1, Number(c.req.query('limit')) || 100));
    return c.json([...store.data.changes].reverse().slice(0, limit));
  });

  app.get('/api/files', (c) => {
    store.refresh();
    return c.json(store.files());
  });
  app.get('/api/files/:name', (c) => {
    store.refresh();
    const name = c.req.param('name');
    const raw = store.rawFile(name);
    if (raw === undefined) return c.json({ error: 'Unknown file' }, 404);
    c.header('Content-Disposition', `attachment; filename="${name}"`);
    return c.body(raw, 200, { 'Content-Type': 'text/csv; charset=utf-8' });
  });

  app.post('/api/ingest', async (c) => {
    if (ctx.cfg.adminToken) {
      if (c.req.header('authorization') !== `Bearer ${ctx.cfg.adminToken}`) return c.json({ error: 'Unauthorized' }, 401);
    } else if (!isLocal(c.env)) {
      return c.json({ error: 'Refresh is only allowed from this machine. Set ADMIN_TOKEN to allow remote refresh.' }, 403);
    }
    const wait = lastManual + MANUAL_COOLDOWN_MS - Date.now();
    if (wait > 0) return c.json({ error: `Refreshed recently — try again in ${Math.ceil(wait / 1000)}s.` }, 429);
    lastManual = Date.now();
    const runs = await runIngest(ctx, { trigger: 'manual' });
    return c.json({ runs });
  });

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const off = ctx.bus.on((e) => void stream.writeSSE({ event: e.type, data: JSON.stringify(e) }));
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ type: 'hello', at: new Date().toISOString() }) });
      const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: '{}' }), 25_000);
      await new Promise<void>((resolve) => stream.onAbort(() => resolve()));
      clearInterval(ping);
      off();
    }),
  );

  app.get('/api/export.csv', (c) => {
    c.header('Content-Disposition', `attachment; filename="frontier-models-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(datasetCsv(ctx), 200, { 'Content-Type': 'text/csv; charset=utf-8' });
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.text('Not found', 404)));
  app.onError((err, c) => {
    console.error('[api]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  });

  return app;
}

/** True for loopback requests (or a test harness with no socket). */
function isLocal(env: unknown): boolean {
  const addr = (env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
  if (!addr) return true;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
