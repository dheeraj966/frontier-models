import type { Benchmark, Model, Score } from '../data/types';

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Wide CSV of the dataset as currently shown (composite uses the active weights). */
export function datasetToCsv(
  models: Model[],
  benchmarks: Benchmark[],
  scores: Score[],
  composites: Map<string, number | null>,
): string {
  const map = new Map(scores.map((s) => [`${s.modelId}\0${s.benchmarkId}`, s]));
  const head = [
    'model',
    'provider',
    'status',
    'release_date',
    'composite',
    ...benchmarks.map((b) => b.shortName),
    'input_usd_per_mtok',
    'output_usd_per_mtok',
    'tokens_per_sec',
    'ttft_s',
    'context_window',
    'sources',
  ];
  const rows = models.map((m) => {
    const src = new Set<string>();
    const vals = benchmarks.map((b) => {
      const s = map.get(`${m.id}\0${b.id}`);
      if (s) src.add(s.sourceId ?? s.source);
      return s?.value ?? '';
    });
    const c = composites.get(m.id);
    return [
      m.name,
      m.provider,
      m.status,
      m.releaseDate,
      c == null ? '' : c.toFixed(2),
      ...vals,
      m.costPerMTokIn,
      m.costPerMTokOut,
      m.outputTokensPerSec,
      m.ttftSeconds,
      m.contextWindow,
      [...src].join('+'),
    ]
      .map(esc)
      .join(',');
  });
  return [head.map(esc).join(','), ...rows].join('\n') + '\n';
}
