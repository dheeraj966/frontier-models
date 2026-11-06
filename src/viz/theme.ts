import { usePreferences } from '../state/preferences';

/** Shared chart styling so every Recharts view reads as one system (per theme). */
const dark = {
  grid: '#232329',
  axis: '#33333b',
  tick: '#a1a1aa',
  tickMuted: '#71717a',
  cursorFill: 'rgba(139, 124, 246, 0.08)',
  cursorStroke: '#3f3f46',
  projectedStroke: '#fafafa',
  labelHalo: '#111114',
  label: '#e4e4e7',
  accent: '#8b7cf6',
  font: 12,
};
const light: typeof dark = {
  grid: '#ececef',
  axis: '#d4d4d8',
  tick: '#52525b',
  tickMuted: '#71717a',
  cursorFill: 'rgba(109, 90, 230, 0.06)',
  cursorStroke: '#d4d4d8',
  projectedStroke: '#18181b',
  labelHalo: '#ffffff',
  label: '#27272a',
  accent: '#6d5ae6',
  font: 12,
};

export type ChartTheme = typeof dark;

/** Back-compat constant (dark) for code outside React. */
export const chartTheme = dark;

export function useChartTheme(): ChartTheme {
  return usePreferences().resolvedTheme === 'light' ? light : dark;
}

/** Opacity for a series given hover focus: the focused one pops, others recede. */
export function focusOpacity(id: string, focus: string | null, base: number): number {
  if (focus === null) return base;
  return focus === id ? Math.min(1, base + 0.1) : base * 0.18;
}
