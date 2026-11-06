/**
 * Sequential heat ramp for the heatmap. t in [0, 1] (0 = worst, 1 = best).
 * Deep navy → teal → mint: monotonic in lightness, so the order reads
 * correctly even in grayscale and for red/green colour-blind viewers.
 */
const STOPS: [number, [number, number, number]][] = [
  [0.0, [24, 32, 52]],
  [0.25, [30, 58, 102]],
  [0.5, [27, 108, 140]],
  [0.75, [38, 160, 150]],
  [1.0, [134, 222, 160]],
];

function rgbAt(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (x <= t1) {
      const k = (x - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function heatColor(t: number): string {
  const [r, g, b] = rgbAt(t);
  return `rgb(${r} ${g} ${b})`;
}

const relLum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
// Pure black/white: any continuous dark→light ramp crosses a luminance where
// off-black/off-white text dips to ~4.2:1; pure #000/#fff keep ≥ 4.58:1 everywhere.
const DARK_TEXT = '#000000';
const LIGHT_TEXT = '#ffffff';
const L_DARK = 0;
const L_LIGHT = 1;

/** Whichever text colour (near-black / near-white) has the higher contrast on heatColor(t). */
export function heatTextColor(t: number): string {
  const bg = relLum(rgbAt(t));
  const onDark = (L_LIGHT + 0.05) / (bg + 0.05);
  const onLight = (bg + 0.05) / (L_DARK + 0.05);
  return onLight >= onDark ? DARK_TEXT : LIGHT_TEXT;
}

export function heatGradient(): string {
  return `linear-gradient(90deg, ${STOPS.map(([t]) => `${heatColor(t)} ${t * 100}%`).join(', ')})`;
}
