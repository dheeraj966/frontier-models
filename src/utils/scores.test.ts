import { describe, expect, it } from 'vitest';
import type { Benchmark, Score } from '../data/types';
import { buildScoreLookup, compositeScore, coverage, formatScore, median, normalizeScore, rankBy } from './scores';

const pct = (id: string, weight: number): Benchmark => ({
  id,
  name: id,
  shortName: id,
  category: 'reasoning',
  min: 0,
  max: 100,
  unit: '%',
  direction: 'higher-better',
  weight,
});
const elo: Benchmark = {
  id: 'elo',
  name: 'Elo',
  shortName: 'Elo',
  category: 'human-preference',
  min: 1000,
  max: 1600,
  unit: 'elo',
  direction: 'higher-better',
  weight: 0.2,
};
const s = (modelId: string, benchmarkId: string, value: number | null): Score => ({
  modelId,
  benchmarkId,
  value,
  source: 'mock',
});

describe('normalizeScore', () => {
  it('scales to the declared range and clamps', () => {
    expect(normalizeScore(elo, 1300)).toBe(50);
    expect(normalizeScore(elo, 900)).toBe(0);
    expect(normalizeScore(elo, 1700)).toBe(100);
  });
  it('flips lower-better benchmarks', () => {
    expect(normalizeScore({ ...pct('x', 1), direction: 'lower-better' }, 20)).toBe(80);
  });
});

describe('compositeScore', () => {
  const benches = [pct('a', 0.5), pct('b', 0.3), elo];
  it('is the weighted mean of scaled scores', () => {
    const lookup = buildScoreLookup([s('m', 'a', 80), s('m', 'b', 60), s('m', 'elo', 1300)]);
    expect(compositeScore(benches, lookup, 'm')).toBeCloseTo((80 * 0.5 + 60 * 0.3 + 50 * 0.2) / 1.0);
  });
  it('renormalizes over evaluated benchmarks', () => {
    const lookup = buildScoreLookup([s('m', 'a', 80), s('m', 'b', null), s('m', 'elo', 1300)]);
    expect(compositeScore(benches, lookup, 'm')).toBeCloseTo((80 * 0.5 + 50 * 0.2) / 0.7);
  });
  it('returns null below the coverage threshold', () => {
    const lookup = buildScoreLookup([s('m', 'elo', 1500)]);
    expect(coverage(benches, lookup, 'm')).toBeCloseTo(0.2);
    expect(compositeScore(benches, lookup, 'm')).toBeNull();
    expect(compositeScore(benches, lookup, 'm', 0)).toBeCloseTo(83.333, 2);
  });
  it('honours custom weights (zero weight drops a benchmark)', () => {
    const lookup = buildScoreLookup([s('m', 'a', 90), s('m', 'b', 10), s('m', 'elo', 1000)]);
    const custom = [pct('a', 1), pct('b', 0), { ...elo, weight: 0 }];
    expect(compositeScore(custom, lookup, 'm')).toBe(90);
  });
});

describe('helpers', () => {
  it('ranks best-first and skips nulls', () => {
    const r = rankBy(
      new Map([
        ['x', 50],
        ['y', null],
        ['z', 70],
      ]),
    );
    expect([...r.entries()]).toEqual([
      ['z', 1],
      ['x', 2],
    ]);
  });
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('formats by unit', () => {
    expect(formatScore(elo, 1432.6)).toBe('1433 Elo');
    expect(formatScore(pct('a', 1), 81.25)).toBe('81.3%');
  });
});
