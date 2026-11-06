import type { AppContext } from './context';
import { colorFor, matchModels, shortNameFor } from './matching';
import type { SourcePlugin } from './sources/types';
import type { ChangeEvent, IngestRun, Model } from '../src/data/types';

const inflight = new WeakMap<object, Promise<IngestRun[]>>();

/**
 * Pull every configured source (or the ones named), match records to models,
 * append dated score rows to scores.csv, update price/speed columns in
 * models.csv, log every changed value to changes.csv, and notify listeners
 * (open browsers via SSE, plus an optional chat webhook).
 */
export function runIngest(ctx: AppContext, opts: { trigger: IngestRun['trigger']; sourceIds?: string[] }): Promise<IngestRun[]> {
  const existing = inflight.get(ctx.store);
  if (existing) return existing;
  const p = (async () => {
    ctx.store.refresh();
    const runs: IngestRun[] = [];
    for (const plugin of ctx.sources) {
      if (opts.sourceIds && !opts.sourceIds.includes(plugin.id)) continue;
      runs.push(await ingestOne(ctx, plugin, opts.trigger));
    }
    await notify(ctx, runs);
    return runs;
  })().finally(() => inflight.delete(ctx.store));
  inflight.set(ctx.store, p);
  return p;
}

const STAT_FIELDS = [
  ['input_price', 'costPerMTokIn', 'costIn'],
  ['output_price', 'costPerMTokOut', 'costOut'],
  ['output_tps', 'outputTokensPerSec', 'outputTps'],
  ['ttft_s', 'ttftSeconds', 'ttft'],
] as const;

async function ingestOne(ctx: AppContext, plugin: SourcePlugin, trigger: IngestRun['trigger']): Promise<IngestRun> {
  const { store, cfg, bus } = ctx;
  const run = store.startRun(plugin.id, trigger);
  if (!plugin.isConfigured(cfg)) {
    const done = store.finishRun(run, {
      status: 'skipped',
      message: `${plugin.label} is not configured (add AA_API_KEY to .env).`,
    });
    bus.emit({ type: 'ingest-finished', run: done });
    return done;
  }
  bus.emit({ type: 'ingest-started', sourceId: plugin.id, trigger });

  try {
    const result = await plugin.fetch(cfg, ctx.fetchImpl);
    store.refresh();
    const data = store.data;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const benchIds = new Set(data.benchmarks.map((b) => b.id));
    const before = new Map(store.currentScores().map((s) => [`${s.modelId}\0${s.benchmarkId}`, s.value]));
    const changes: ChangeEvent[] = [];

    // Links: slugs remembered in models.csv (aa_slug) + AA_ALIASES.
    const links: Record<string, string> = {};
    for (const m of data.models) if (m.aaSlug) links[m.id] = m.aaSlug;
    Object.assign(links, plugin.aliases?.(cfg) ?? {});
    const { matches, unmatchedModels, unusedExternal } = matchModels(data.models, result.models, links);

    // Optional: keep the N best-ranked models we don't define ourselves.
    let imported = 0;
    const topN = plugin.importTop?.(cfg) ?? 0;
    if (topN > 0) {
      const importedIds = new Set(data.models.filter((m) => m.origin === 'import').map((m) => m.id));
      const held = [...matches].filter(([mid]) => importedIds.has(mid)).map(([, e]) => e);
      const pool = [...held, ...unusedExternal].filter((e) => e.rank !== undefined).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
      for (const e of pool.slice(0, topN).filter((x) => unusedExternal.includes(x))) {
        const creator = e.creator ?? 'Unknown';
        const m: Model = {
          id: `aa-${e.externalId}`,
          name: e.name,
          shortName: shortNameFor(e.name),
          provider: creator,
          family: creator,
          status: 'released',
          releaseDate: e.releaseDate ?? undefined,
          color: colorFor(creator),
          origin: 'import',
          aaSlug: e.externalId,
          statsSource: 'mock',
        };
        data.models.push(m);
        matches.set(m.id, e);
        imported++;
      }
    }

    for (const [modelId, e] of matches) {
      const m = data.models.find((x) => x.id === modelId)!;
      for (const [field, key, ext] of STAT_FIELDS) {
        const next = e[ext];
        if (next == null) continue;
        const prev = m[key] ?? null;
        if (prev !== next) changes.push({ at: now, sourceId: plugin.id, modelId, field, oldValue: prev, newValue: next });
        m[key] = next;
      }
      if (e.contextWindow != null) m.contextWindow = e.contextWindow;
      if (e.releaseDate) m.releaseDate = e.releaseDate.slice(0, 10);
      m.statsSource = plugin.scoreSource;
      m.statsAsOf = today;
      m.aaSlug = e.externalId;

      for (const [benchId, value] of Object.entries(e.scores)) {
        if (value === null || !benchIds.has(benchId)) continue;
        const old = before.get(`${modelId}\0${benchId}`) ?? null;
        if (old === null || Math.abs(old - value) > 1e-9)
          changes.push({ at: now, sourceId: plugin.id, modelId, field: benchId, oldValue: old, newValue: value });
        const i = data.points.findIndex(
          (p) => p.modelId === modelId && p.benchmarkId === benchId && p.sourceId === plugin.id && p.asOf === today,
        );
        const row = { modelId, benchmarkId: benchId, value, source: plugin.scoreSource, sourceId: plugin.id, asOf: today };
        if (i >= 0) data.points[i] = row;
        else data.points.push(row);
      }
    }

    data.changes.push(...changes);
    store.save(['models', 'scores']);
    const matched = matches.size - imported;
    const msg = [
      result.note,
      `matched ${matched}`,
      imported ? `imported ${imported}` : '',
      `${changes.length} value${changes.length === 1 ? '' : 's'} changed`,
      unmatchedModels.length ? `no match for: ${unmatchedModels.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const done = store.finishRun(run, {
      status: 'ok',
      message: msg,
      matched,
      imported,
      changed: changes.length,
      unmatched: unmatchedModels,
    });
    bus.emit({ type: 'ingest-finished', run: done });
    return done;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const done = store.finishRun(run, { status: 'error', message });
    bus.emit({ type: 'ingest-finished', run: done });
    return done;
  }
}

/** Post a one-line summary to a chat webhook (Slack, Discord, Teams, Google Chat all accept this shape). */
async function notify(ctx: AppContext, runs: IngestRun[]) {
  const url = ctx.cfg.notifyWebhook;
  if (!url) return;
  const interesting = runs.filter((r) => r.status === 'error' || (r.status === 'ok' && r.changed + r.imported > 0));
  if (!interesting.length) return;
  const text = interesting
    .map((r) =>
      r.status === 'ok'
        ? `📈 Frontier Model Viz: ${r.changed} values changed${r.imported ? `, ${r.imported} new models` : ''} (${r.sourceId})`
        : `⚠️ Frontier Model Viz refresh failed (${r.sourceId}): ${r.message}`,
    )
    .join('\n');
  try {
    await ctx.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.warn('[notify] webhook failed:', err instanceof Error ? err.message : err);
  }
}
