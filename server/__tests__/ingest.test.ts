import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runIngest } from '../ingest';
import { mapAAModel } from '../sources/artificialAnalysis';
import { CsvStore } from '../store';
import { fixture, makeCtx } from './helpers';

describe('Artificial Analysis mapping', () => {
  it('maps index, prices, speed and Pro fractions onto our scales', () => {
    const e = mapAAModel({
      id: '1',
      name: 'X',
      slug: 'x',
      model_creator: { name: 'Lab' },
      evaluations: { artificial_analysis_intelligence_index: 55.5, gpqa_diamond: 0.917, mmmu_pro: null },
      pricing: { price_1m_input_tokens: 1.4, price_1m_output_tokens: 4.4 },
      performance: { median_output_tokens_per_second: 80, median_time_to_first_token_seconds: 0.4 },
    });
    expect(e.scores).toEqual({ 'aa-intelligence-index': 55.5, 'gpqa-diamond': 91.7 });
    expect([e.costIn, e.costOut, e.outputTps, e.ttft, e.creator]).toEqual([1.4, 4.4, 80, 0.4, 'Lab']);
  });
});

describe('runIngest (CSV store)', () => {
  it('writes live rows that beat mock, logs changes, updates models.csv, persists to disk', async () => {
    const ctx = makeCtx();
    const events: string[] = [];
    ctx.bus.on((e) => events.push(e.type));
    const [run] = await runIngest(ctx, { trigger: 'cli' });

    expect(run.status).toBe('ok');
    expect(run.matched).toBe(4);
    expect(run.message).toContain('Intelligence Index v5');
    expect(ctx.calls[0]).toContain('/language/models/free?page=1');
    expect(events).toEqual(['ingest-started', 'ingest-finished']);

    // Re-read from disk to prove it was saved.
    const disk = new CsvStore(ctx.cfg.dataDir);
    const aa = disk.currentScores().find((s) => s.modelId === 'claude-fable-5.5' && s.benchmarkId === 'aa-intelligence-index');
    expect(aa).toMatchObject({ value: 61.3, source: 'leaderboard', sourceId: 'artificial-analysis' });
    expect(disk.history('claude-fable-5.5').filter((p) => p.benchmarkId === 'aa-intelligence-index')).toHaveLength(2);
    const astra = disk.data.models.find((m) => m.id === 'gpt-6.1-astra')!;
    expect(astra).toMatchObject({
      outputTokensPerSec: 102.5,
      ttftSeconds: 2.1,
      statsSource: 'leaderboard',
      aaSlug: 'gpt-6-1-astra',
    });
    expect(disk.data.changes.length).toBe(run.changed);
    expect(disk.data.changes.some((c) => c.field === 'output_tps' && c.modelId === 'gpt-6.1-astra')).toBe(true);
    expect(disk.runs(1)[0]).toMatchObject({ status: 'ok', matched: 4 });
    expect(readFileSync(join(ctx.cfg.dataDir, 'scores.csv'), 'utf8')).toContain('artificial-analysis');
    // mock benchmarks stay mock
    expect(disk.currentScores().find((s) => s.modelId === 'gpt-6.1-astra' && s.benchmarkId === 'mmlu-pro')?.source).toBe('mock');
  });

  it('a second identical run changes nothing and adds no score rows', async () => {
    const ctx = makeCtx();
    await runIngest(ctx, { trigger: 'cli' });
    const rows = ctx.store.data.points.length;
    const [again] = await runIngest(ctx, { trigger: 'cli' });
    expect(again.changed).toBe(0);
    expect(ctx.store.data.points.length).toBe(rows);
  });

  it('imports only the top-N untracked models and keeps N stable', async () => {
    const ctx = makeCtx({ aaImportTop: 1 });
    const [a] = await runIngest(ctx, { trigger: 'cli' });
    const [b] = await runIngest(ctx, { trigger: 'cli' });
    expect([a.imported, b.imported]).toEqual([1, 0]);
    expect(ctx.store.data.models.filter((m) => m.origin === 'import').map((m) => m.name)).toEqual(['GPT-6.1 Astra (xhigh)']);
  });

  it('records skipped / error runs and surfaces rate limits', async () => {
    expect((await runIngest(makeCtx({ aaApiKey: undefined }), { trigger: 'manual' }))[0].status).toBe('skipped');
    const [bad] = await runIngest(makeCtx({ aaApiKey: 'wrong' }), { trigger: 'manual' });
    expect(bad.message).toMatch(/401/);
    const [limited] = await runIngest(makeCtx({}, fixture('aa-free.json'), 429), { trigger: 'manual' });
    expect(limited.message).toMatch(/Rate limited/);
  });

  it('pings the webhook only when something changed', async () => {
    const ctx = makeCtx({ notifyWebhook: 'https://hooks.example/x' });
    await runIngest(ctx, { trigger: 'cli' });
    await runIngest(ctx, { trigger: 'cli' });
    expect(ctx.posts).toHaveLength(1);
    expect(JSON.parse(ctx.posts[0]).text).toMatch(/values changed/);
  });

  it('picks up hand edits to the CSV files', async () => {
    const ctx = makeCtx();
    const p = join(ctx.cfg.dataDir, 'models.csv');
    const { writeFileSync } = await import('node:fs');
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(p, readFileSync(p, 'utf8').replace('Claude Fable 5.5,Fable 5.5', 'Claude Fable 5.5,Fable Five'));
    expect(ctx.store.refresh()).toBe(true);
    expect(ctx.store.data.models[0].shortName).toBe('Fable Five');
  });
});
