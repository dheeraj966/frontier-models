import { parseCsv, toCsv, type CsvRow } from './csv';
import type {
  Benchmark,
  ChangeEvent,
  DatasetMeta,
  DatasetPayload,
  IngestRun,
  Model,
  Score,
  ScorePoint,
  ScoreSource,
  SourceInfo,
} from '../data/types';

/**
 * The CSV "database": five plain files in /data that open in Excel.
 *   models.csv · benchmarks.csv · scores.csv (every observation) · runs.csv · changes.csv
 * This module converts between those files and typed objects; the browser and
 * the server both use it, so they always agree on the format.
 */
export const FILES = ['models', 'benchmarks', 'scores', 'runs', 'changes'] as const;
export type TableName = (typeof FILES)[number];
export type RawTables = Partial<Record<TableName, string>>;

export const COLUMNS: Record<TableName, string[]> = {
  models: [
    'id',
    'name',
    'short_name',
    'provider',
    'family',
    'status',
    'baseline',
    'release_date',
    'color',
    'context_window',
    'input_price',
    'output_price',
    'output_tps',
    'ttft_s',
    'stats_source',
    'stats_as_of',
    'origin',
    'aa_slug',
    'notes',
  ],
  benchmarks: ['id', 'name', 'short_name', 'category', 'min', 'max', 'unit', 'direction', 'weight', 'description'],
  scores: ['model_id', 'benchmark_id', 'value', 'source', 'source_id', 'as_of'],
  runs: [
    'id',
    'source_id',
    'trigger',
    'started_at',
    'finished_at',
    'status',
    'matched',
    'imported',
    'changed',
    'message',
    'unmatched',
  ],
  changes: ['at', 'source_id', 'model_id', 'field', 'old_value', 'new_value'],
};

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const numOrNull = (s: string | undefined) => num(s) ?? null;
const str = (s: string | undefined) => (s === undefined || s === '' ? undefined : s);
const yes = (s: string | undefined) => /^(1|y|yes|true|x)$/i.test(s?.trim() ?? '');

/** Accepts ISO dates and the usual spreadsheet re-formats (12/08/2026, 2026/8/12). */
export function normDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  let m = t.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy (most locales incl. India)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10);
}

export const rowToModel = (r: CsvRow): Model => ({
  id: r.id,
  name: r.name || r.id,
  shortName: r.short_name || r.name || r.id,
  provider: r.provider || 'Unknown',
  family: r.family || r.provider || 'Unknown',
  status: (['released', 'expected', 'rumored'].includes(r.status) ? r.status : 'released') as Model['status'],
  baseline: yes(r.baseline) || undefined,
  releaseDate: normDate(r.release_date),
  color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#8b8f9c',
  contextWindow: num(r.context_window),
  costPerMTokIn: num(r.input_price),
  costPerMTokOut: num(r.output_price),
  outputTokensPerSec: num(r.output_tps),
  ttftSeconds: num(r.ttft_s),
  statsSource: (str(r.stats_source) as ScoreSource) ?? 'mock',
  statsAsOf: normDate(r.stats_as_of),
  origin: r.origin === 'import' ? 'import' : 'seed',
  aaSlug: str(r.aa_slug),
  notes: str(r.notes),
});

export const modelToRow = (m: Model): Record<string, unknown> => ({
  id: m.id,
  name: m.name,
  short_name: m.shortName,
  provider: m.provider,
  family: m.family,
  status: m.status,
  baseline: m.baseline ? 'yes' : '',
  release_date: m.releaseDate ?? '',
  color: m.color,
  context_window: m.contextWindow,
  input_price: m.costPerMTokIn,
  output_price: m.costPerMTokOut,
  output_tps: m.outputTokensPerSec,
  ttft_s: m.ttftSeconds,
  stats_source: m.statsSource ?? 'mock',
  stats_as_of: m.statsAsOf ?? '',
  origin: m.origin ?? 'seed',
  aa_slug: m.aaSlug ?? '',
  notes: m.notes ?? '',
});

export const rowToBenchmark = (r: CsvRow): Benchmark => ({
  id: r.id,
  name: r.name || r.id,
  shortName: r.short_name || r.name || r.id,
  category: (r.category || 'reasoning') as Benchmark['category'],
  min: num(r.min) ?? 0,
  max: num(r.max) ?? 100,
  unit: (['%', 'elo', 'score'].includes(r.unit) ? r.unit : 'score') as Benchmark['unit'],
  direction: r.direction === 'lower-better' ? 'lower-better' : 'higher-better',
  weight: num(r.weight) ?? 0,
  description: str(r.description),
});

export const rowToPoint = (r: CsvRow): ScorePoint => ({
  modelId: r.model_id,
  benchmarkId: r.benchmark_id,
  value: numOrNull(r.value),
  source: (str(r.source) as ScoreSource) ?? 'mock',
  sourceId: str(r.source_id) ?? 'mock',
  asOf: normDate(r.as_of) ?? '1970-01-01',
});

export const pointToRow = (p: ScorePoint) => ({
  model_id: p.modelId,
  benchmark_id: p.benchmarkId,
  value: p.value ?? '',
  source: p.source,
  source_id: p.sourceId ?? p.source,
  as_of: p.asOf,
});

export const rowToRun = (r: CsvRow): IngestRun => ({
  id: num(r.id) ?? 0,
  sourceId: r.source_id,
  trigger: (r.trigger || 'cli') as IngestRun['trigger'],
  startedAt: r.started_at,
  finishedAt: str(r.finished_at),
  status: (r.status || 'ok') as IngestRun['status'],
  message: str(r.message),
  matched: num(r.matched) ?? 0,
  imported: num(r.imported) ?? 0,
  changed: num(r.changed) ?? 0,
  unmatched: r.unmatched ? r.unmatched.split('|').filter(Boolean) : undefined,
});

export const runToRow = (r: IngestRun) => ({
  id: r.id,
  source_id: r.sourceId,
  trigger: r.trigger,
  started_at: r.startedAt,
  finished_at: r.finishedAt ?? '',
  status: r.status,
  matched: r.matched,
  imported: r.imported,
  changed: r.changed,
  message: r.message ?? '',
  unmatched: (r.unmatched ?? []).join('|'),
});

export const rowToChange = (r: CsvRow): ChangeEvent => ({
  at: r.at,
  sourceId: r.source_id,
  modelId: r.model_id,
  field: r.field,
  oldValue: numOrNull(r.old_value),
  newValue: numOrNull(r.new_value),
});

export const changeToRow = (c: ChangeEvent) => ({
  at: c.at,
  source_id: c.sourceId,
  model_id: c.modelId,
  field: c.field,
  old_value: c.oldValue ?? '',
  new_value: c.newValue ?? '',
});

/** Current value per (model, benchmark): any live source beats mock; newest date wins; later rows win ties. */
export function currentScores(points: ScorePoint[]): Score[] {
  const best = new Map<string, ScorePoint>();
  for (const p of points) {
    const k = `${p.modelId}\0${p.benchmarkId}`;
    const cur = best.get(k);
    if (!cur) {
      best.set(k, p);
      continue;
    }
    const pLive = p.source !== 'mock';
    const cLive = cur.source !== 'mock';
    if (pLive !== cLive ? pLive : p.asOf >= cur.asOf) best.set(k, p);
  }
  return [...best.values()].map((p) => ({
    modelId: p.modelId,
    benchmarkId: p.benchmarkId,
    value: p.value,
    source: p.source,
    sourceId: p.sourceId,
    asOf: p.asOf,
  }));
}

export interface Tables {
  models: Model[];
  benchmarks: Benchmark[];
  points: ScorePoint[];
  runs: IngestRun[];
  changes: ChangeEvent[];
}

export function parseTables(raw: RawTables): Tables {
  const rows = (t: TableName) => (raw[t] ? parseCsv(raw[t]!) : []);
  return {
    models: rows('models')
      .filter((r) => r.id)
      .map(rowToModel),
    benchmarks: rows('benchmarks')
      .filter((r) => r.id)
      .map(rowToBenchmark),
    points: rows('scores')
      .filter((r) => r.model_id && r.benchmark_id)
      .map(rowToPoint),
    runs: rows('runs')
      .filter((r) => r.source_id)
      .map(rowToRun),
    changes: rows('changes')
      .filter((r) => r.model_id)
      .map(rowToChange),
  };
}

export function serializeTable(t: TableName, tables: Tables): string {
  switch (t) {
    case 'models':
      return toCsv(tables.models.map(modelToRow), COLUMNS.models);
    case 'benchmarks':
      return toCsv(
        tables.benchmarks.map((b) => ({ ...b, short_name: b.shortName, description: b.description ?? '' })),
        COLUMNS.benchmarks,
      );
    case 'scores':
      return toCsv(tables.points.map(pointToRow), COLUMNS.scores);
    case 'runs':
      return toCsv(tables.runs.map(runToRow), COLUMNS.runs);
    case 'changes':
      return toCsv(tables.changes.map(changeToRow), COLUMNS.changes);
  }
}

/** Assemble what the UI consumes. */
export function toPayload(
  tables: Tables,
  meta: Omit<DatasetMeta, 'sources'> & { sources?: SourceInfo[] },
  raw?: RawTables,
): DatasetPayload {
  const known = new Set(tables.models.map((m) => m.id));
  const runs = [...tables.runs].sort((a, b) => b.id - a.id);
  const sources = meta.sources ?? deriveSources(runs);
  return {
    models: tables.models,
    benchmarks: tables.benchmarks,
    scores: currentScores(tables.points.filter((p) => known.has(p.modelId))),
    meta: { ...meta, sources },
    runs: runs.slice(0, 50),
    changes: [...tables.changes].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 200),
    files: raw
      ? FILES.filter((f) => raw[f] !== undefined).map((f) => ({
          name: `${f}.csv`,
          rows: Math.max(0, parseCsv(raw[f]!).length),
          bytes: new TextEncoder().encode(raw[f]!).length,
        }))
      : undefined,
  };
}

/** Static builds have no server: describe sources from the run log. */
function deriveSources(runs: IngestRun[]): SourceInfo[] {
  const last = runs.find((r) => r.sourceId === 'artificial-analysis');
  return [
    {
      id: 'artificial-analysis',
      label: 'Artificial Analysis',
      configured: Boolean(last && last.status !== 'skipped'),
      attribution: { text: 'Artificial Analysis', url: 'https://artificialanalysis.ai/' },
      provides: ['AA Intelligence Index', 'prices', 'speed', 'latency', 'release dates'],
      lastRun: last,
    },
  ];
}
