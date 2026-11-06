import type { AppContext } from './context';
import type { DatasetPayload, SourceInfo } from '../src/data/types';
import { datasetToCsv } from '../src/lib/exportCsv';
import { buildScoreLookup, compositeScore } from '../src/utils/scores';

export function sourceInfo(ctx: AppContext): SourceInfo[] {
  return ctx.sources.map((s) => ({
    id: s.id,
    label: s.label,
    configured: s.isConfigured(ctx.cfg),
    attribution: s.attribution,
    provides: s.provides(ctx.cfg),
    lastRun: ctx.store.lastRun(s.id),
  }));
}

export function buildDataset(ctx: AppContext): DatasetPayload {
  ctx.store.refresh();
  const sources = sourceInfo(ctx);
  const payload = ctx.store.payload({
    provider: 'api',
    generatedAt: new Date().toISOString(),
    sources,
    canRefresh: sources.some((s) => s.configured),
    nextRefreshAt: ctx.nextRefreshAt?.(),
  });
  payload.files = ctx.store.files();
  return payload;
}

/** Wide CSV: one row per model, one column per benchmark, plus composite. */
export function datasetCsv(ctx: AppContext): string {
  const { models, benchmarks, scores } = buildDataset(ctx);
  const lookup = buildScoreLookup(scores);
  const comps = new Map(models.map((m) => [m.id, compositeScore(benchmarks, lookup, m.id)]));
  return datasetToCsv(models, benchmarks, scores, comps);
}
