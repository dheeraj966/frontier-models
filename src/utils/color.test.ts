import { describe, expect, it } from 'vitest';
import { heatColor, heatTextColor } from './color';

const lum = (rgb: string) => {
  const [r, g, b] = rgb
    .match(/\d+/g)!
    .map(Number)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe('heat ramp', () => {
  it('keeps WCAG AA text contrast across the whole ramp', () => {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const bg = lum(heatColor(t));
      const fg = heatTextColor(t) === '#000000' ? 0 : 1;
      expect(contrast(bg, fg), `t=${t}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('gets lighter as scores improve', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const l = lum(heatColor(i / 20));
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});
