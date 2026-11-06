import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FILES, currentScores, parseTables, type RawTables } from '../src/lib/dataset';
import { validateDataset } from './validate';

const raw: RawTables = Object.fromEntries(
  FILES.map((f) => [f, readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8')]),
);
const t = parseTables(raw);

describe('data/*.csv', () => {
  it('passes validation', () => {
    expect(validateDataset(t.models, t.benchmarks, currentScores(t.points))).toEqual([]);
  });
  it('catches broken data', () => {
    const errs = validateDataset(
      [...t.models, { ...t.models[0] }],
      t.benchmarks.map((b, i) => (i === 0 ? { ...b, weight: b.weight + 0.5 } : b)),
      [...currentScores(t.points), { modelId: 'ghost', benchmarkId: 'mmlu-pro', value: 50, source: 'mock' }],
    ).join('\n');
    expect(errs).toMatch(/duplicate model id/);
    expect(errs).toMatch(/weights sum/);
    expect(errs).toMatch(/unknown model "ghost"/);
  });
});
