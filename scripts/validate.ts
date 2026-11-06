import type { Benchmark, Model, Score } from '../src/data/types';

/** Static checks on the code-defined dataset. Returns human-readable problems (empty = OK). */
export function validateDataset(models: Model[], benchmarks: Benchmark[], scores: Score[]): string[] {
  const errs: string[] = [];
  const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

  for (const id of dup(models.map((m) => m.id))) errs.push(`duplicate model id "${id}"`);
  for (const id of dup(benchmarks.map((b) => b.id))) errs.push(`duplicate benchmark id "${id}"`);
  for (const c of dup(models.map((m) => m.color.toLowerCase()))) errs.push(`colour ${c} is used by more than one model`);

  const wsum = benchmarks.reduce((a, b) => a + b.weight, 0);
  if (Math.abs(wsum - 1) > 0.001) errs.push(`benchmark weights sum to ${wsum.toFixed(3)}, expected 1.000`);

  for (const m of models) {
    if (!/^#[0-9a-f]{6}$/i.test(m.color)) errs.push(`${m.id}: colour "${m.color}" is not #rrggbb`);
    if (m.origin !== 'import' && m.shortName.length > 14)
      errs.push(`${m.id}: shortName "${m.shortName}" is longer than 14 chars (crowds chart labels)`);
    if (m.status === 'released' && !m.releaseDate) errs.push(`${m.id}: released model without releaseDate`);
    if (m.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(m.releaseDate))
      errs.push(`${m.id}: release_date "${m.releaseDate}" should look like 2026-08-12`);
    if (m.baseline && !models.some((o) => o.family === m.family && o.id !== m.id))
      errs.push(`${m.id}: baseline has no newer model in family "${m.family}"`);
  }

  for (const b of benchmarks) {
    if (!(b.max > b.min)) errs.push(`${b.id}: max must be greater than min`);
    if (!(b.weight >= 0)) errs.push(`${b.id}: weight must be ≥ 0`);
  }

  const mids = new Set(models.map((m) => m.id));
  const bmap = new Map(benchmarks.map((b) => [b.id, b]));
  for (const s of scores) {
    if (!mids.has(s.modelId)) errs.push(`score for unknown model "${s.modelId}"`);
    const b = bmap.get(s.benchmarkId);
    if (!b) {
      errs.push(`score for unknown benchmark "${s.benchmarkId}"`);
      continue;
    }
    if (s.value !== null && (s.value < b.min || s.value > b.max))
      errs.push(`${s.modelId} × ${s.benchmarkId}: ${s.value} outside ${b.min}–${b.max}`);
  }
  for (const m of models.filter((x) => x.origin !== 'import')) {
    const have = new Set(scores.filter((s) => s.modelId === m.id).map((s) => s.benchmarkId));
    const missing = benchmarks.filter((b) => !have.has(b.id)).map((b) => b.id);
    if (missing.length) errs.push(`${m.id}: no row for ${missing.join(', ')} (use an explicit null for "not evaluated")`);
  }
  return errs;
}
