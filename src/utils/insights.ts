import type { Benchmark, BenchmarkCategory, Model } from '../data/types';
import { compositeScore } from './scores';

export interface Category {
  id: string;
  label: string;
  cats: BenchmarkCategory[] | 'all';
  icon: string;
}

/** Leaderboard / highlight categories. Only those with at least one benchmark are shown. */
export const CATEGORIES: Category[] = [
  { id: 'overall', label: 'Overall', cats: 'all', icon: 'layers' },
  { id: 'coding', label: 'Coding', cats: ['coding'], icon: 'code' },
  { id: 'reasoning', label: 'Reasoning', cats: ['reasoning'], icon: 'brain' },
  { id: 'math', label: 'Math', cats: ['math'], icon: 'sigma' },
  { id: 'knowledge', label: 'Knowledge', cats: ['knowledge'], icon: 'book' },
  { id: 'multimodal', label: 'Multimodal', cats: ['multimodal'], icon: 'image' },
  { id: 'agentic', label: 'Agentic', cats: ['agentic'], icon: 'bolt' },
  { id: 'human-preference', label: 'Human pref.', cats: ['human-preference'], icon: 'user' },
  { id: 'aggregate', label: 'AA Index', cats: ['aggregate'], icon: 'chart' },
];

export const availableCategories = (benchmarks: Benchmark[]) =>
  CATEGORIES.filter((c) => c.cats === 'all' || benchmarks.some((b) => (c.cats as string[]).includes(b.category)));

export const benchmarksFor = (benchmarks: Benchmark[], cat: Category) =>
  cat.cats === 'all' ? benchmarks : benchmarks.filter((b) => (cat.cats as string[]).includes(b.category));

/** Score per model for a category (weighted, renormalized; single-benchmark categories need no coverage). */
export function categoryScores(models: Model[], benchmarks: Benchmark[], lookup: Map<string, number | null>, cat: Category) {
  const bs = benchmarksFor(benchmarks, cat).map((b) => (cat.cats === 'all' ? b : { ...b, weight: b.weight > 0 ? b.weight : 1 }));
  return new Map(models.map((m) => [m.id, compositeScore(bs, lookup, m.id, cat.cats === 'all' ? undefined : 0)]));
}

/** 3:1 input:output blend — the usual way to quote one price per model. */
export function blendedPrice(m: Model): number | null {
  if (m.costPerMTokIn == null || m.costPerMTokOut == null) return m.costPerMTokIn ?? m.costPerMTokOut ?? null;
  return (3 * m.costPerMTokIn + m.costPerMTokOut) / 4;
}

export const DAY = 86_400_000;

export function isNew(m: Model, now = Date.now(), days = 45): boolean {
  if (!m.releaseDate) return false;
  const t = Date.parse(`${m.releaseDate}T00:00:00Z`);
  return now - t >= 0 && now - t <= days * DAY;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v < 1) return `$${v.toFixed(2)}`;
  if (v < 10) return `$${v.toFixed(2).replace(/\.00$/, '')}`;
  return `$${v.toFixed(v % 1 ? 1 : 0)}`;
}

export function fmtCtx(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  return `${Math.round(v / 1000)}k`;
}

export const initials = (provider: string) => {
  const w = provider
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : provider.slice(0, 2)).toUpperCase().slice(0, 2);
};
