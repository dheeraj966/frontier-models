import type { Benchmark, Score } from '../data/types';

const KEY_SEP = '\0';
const key = (modelId: string, benchmarkId: string) => modelId + KEY_SEP + benchmarkId;

/** Lookup map keyed `modelId + NUL + benchmarkId` (collision-proof) → raw value (null = not evaluated). */
export function buildScoreLookup(scores: Score[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const s of scores) map.set(key(s.modelId, s.benchmarkId), s.value);
  return map;
}

export function scoreOf(lookup: Map<string, number | null>, modelId: string, benchmarkId: string): number | null {
  const v = lookup.get(key(modelId, benchmarkId));
  return v === undefined ? null : v;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Min–max normalize a raw score to 0–100 using the benchmark's declared range.
 * Direction-aware (lower-better benchmarks are flipped). Out-of-range raw values are clamped.
 */
export function normalizeScore(benchmark: Benchmark, value: number): number {
  const { min, max, direction } = benchmark;
  if (max === min) return 0;
  const t = clamp((value - min) / (max - min), 0, 1);
  return (direction === 'lower-better' ? 1 - t : t) * 100;
}

/** Share of total weight a composite must cover before it is reported (avoids 1-benchmark composites). */
export const MIN_COVERAGE = 0.5;

/**
 * Weighted composite of normalized scores (weights renormalize over the benchmarks
 * a model actually has). Returns null when no usable scores exist, or when the
 * evaluated benchmarks carry less than `minCoverage` of the total weight.
 */
export function compositeScore(
  benchmarks: Benchmark[],
  lookup: Map<string, number | null>,
  modelId: string,
  minCoverage = MIN_COVERAGE,
): number | null {
  let acc = 0;
  let weightSum = 0;
  let total = 0;
  for (const b of benchmarks) {
    if (!(b.weight > 0)) continue;
    total += b.weight;
    const raw = scoreOf(lookup, modelId, b.id);
    if (raw === null) continue;
    acc += normalizeScore(b, raw) * b.weight;
    weightSum += b.weight;
  }
  if (weightSum <= 0 || weightSum / total < minCoverage) return null;
  return acc / weightSum;
}

/** Fraction of total weight a model has scores for (0–1). */
export function coverage(benchmarks: Benchmark[], lookup: Map<string, number | null>, modelId: string): number {
  let have = 0;
  let total = 0;
  for (const b of benchmarks) {
    if (!(b.weight > 0)) continue;
    total += b.weight;
    if (scoreOf(lookup, modelId, b.id) !== null) have += b.weight;
  }
  return total > 0 ? have / total : 0;
}

/** Rank (1 = best) of every model by a value map; nulls are unranked. */
export function rankBy(values: Map<string, number | null>): Map<string, number> {
  const sorted = [...values.entries()].filter(([, v]) => v !== null).sort((a, b) => (b[1] as number) - (a[1] as number));
  return new Map(sorted.map(([id], i) => [id, i + 1]));
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Format a raw score with its unit: %, elo or plain score. */
export function formatScore(benchmark: Benchmark, value: number): string {
  if (benchmark.unit === 'elo') return `${Math.round(value)} Elo`;
  if (benchmark.unit === '%') return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)}`;
}

/** Short unit label for axes: "%" / "Elo" / "score". */
export function unitLabel(benchmark: Benchmark): string {
  return benchmark.unit === 'elo' ? 'Elo' : benchmark.unit;
}
