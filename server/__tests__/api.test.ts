import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { DatasetPayload } from '../../src/data/types';
import { makeCtx } from './helpers';

describe('HTTP API', () => {
  it('serves the dataset with an ETag and 304s on repeat', async () => {
    const app = createApp(makeCtx({ aaApiKey: undefined }));
    const res = await app.request('/api/dataset');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DatasetPayload;
    expect(body.models.length).toBe(10);
    expect(body.benchmarks.length).toBe(9);
    expect(body.meta).toMatchObject({ provider: 'api', canRefresh: false });
    const etag = res.headers.get('etag')!;
    const again = await app.request('/api/dataset', { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });

  it('returns a model with history, 404 for unknown ones', async () => {
    const app = createApp(makeCtx());
    const ok = await app.request('/api/models/gpt-6');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { scores: unknown[] }).scores.length).toBe(9);
    expect((await app.request('/api/models/nope')).status).toBe(404);
    expect((await app.request('/api/nope')).status).toBe(404);
  });

  it('refreshes on POST /api/ingest, then rate-limits manual refresh', async () => {
    const ctx = makeCtx();
    const app = createApp(ctx);
    const first = await app.request('/api/ingest', { method: 'POST' });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { runs: { status: string }[] }).runs[0].status).toBe('ok');
    expect((await app.request('/api/ingest', { method: 'POST' })).status).toBe(429);
    const ds = (await (await app.request('/api/dataset')).json()) as DatasetPayload;
    expect(ds.meta.canRefresh).toBe(true);
    expect(ds.meta.sources[0].lastRun?.status).toBe('ok');
  });

  it('requires the admin token when one is set', async () => {
    const app = createApp(makeCtx({ adminToken: 's3cret' }));
    expect((await app.request('/api/ingest', { method: 'POST' })).status).toBe(401);
    const ok = await app.request('/api/ingest', { method: 'POST', headers: { authorization: 'Bearer s3cret' } });
    expect(ok.status).toBe(200);
  });

  it('lists and serves the CSV files, and publishes an OpenAPI spec', async () => {
    const app = createApp(makeCtx());
    const files = (await (await app.request('/api/files')).json()) as { name: string; rows: number }[];
    expect(files.map((f) => f.name)).toEqual(['models.csv', 'benchmarks.csv', 'scores.csv', 'runs.csv', 'changes.csv']);
    expect(files[0].rows).toBe(10);
    const csv = await (await app.request('/api/files/models.csv')).text();
    expect(csv.split('\n')[0]).toMatch(/^id,name,short_name/);
    expect((await app.request('/api/files/secret.txt')).status).toBe(404);
    const spec = (await (await app.request('/api/openapi.json')).json()) as { paths: Record<string, unknown> };
    expect(Object.keys(spec.paths)).toContain('/api/dataset');
  });

  it('exports CSV', async () => {
    const res = await createApp(makeCtx()).request('/api/export.csv');
    const csv = await res.text();
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(csv.split('\n')[0]).toContain('AA Index');
    expect(csv.trim().split('\n')).toHaveLength(11);
  });
});
