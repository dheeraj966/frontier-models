import { describe, expect, it } from 'vitest';
import type { Model } from '../data/types';
import { booksText, duration, gradeFor, humanSeconds, jobCost, JOBS, money, summarize, winChance, writeSeconds } from './human';

const model = (over: Partial<Model> = {}): Model =>
  ({
    id: 'm',
    name: 'Model',
    shortName: 'M',
    provider: 'Lab',
    family: 'f',
    color: '#336699',
    status: 'released',
    ...over,
  }) as Model;

describe('gradeFor', () => {
  it('gives the leader A+ and spreads the rest by quartile', () => {
    expect(gradeFor(1, 10).letter).toBe('A+');
    expect(gradeFor(3, 10).letter).toBe('A');
    expect(gradeFor(5, 10).letter).toBe('B');
    expect(gradeFor(7, 10).letter).toBe('C');
    expect(gradeFor(10, 10).letter).toBe('D');
  });
  it('says "not tested" without a rank', () => {
    expect(gradeFor(undefined, 10)).toMatchObject({ letter: '–', tone: 'none' });
  });
});

describe('everyday units', () => {
  it('formats money the way people say it', () => {
    expect(money(0.004)).toBe('< 1¢');
    expect(money(0.22)).toBe('22¢');
    expect(money(1.85)).toBe('$1.85');
    expect(money(1234)).toBe('$1,234');
    expect(money(null)).toBe('—');
  });
  it('formats durations', () => {
    expect(duration(2.44)).toBe('2.4 s');
    expect(duration(450)).toBe('7 min 30 s');
    expect(duration(120)).toBe('2 min');
  });
  it('turns a context window into books', () => {
    expect(booksText(0.5)).toBe('150 pages');
    expect(booksText(1)).toBe('1 book');
    expect(booksText(3.3)).toBe('3.3 books');
    expect(booksText(17)).toBe('17 books');
  });
  it('prices a job from per-million-token rates', () => {
    const m = model({ costPerMTokIn: 10, costPerMTokOut: 30 });
    // 120k in × $10/M + 700 out × $30/M
    expect(jobCost(m, JOBS[0])).toBeCloseTo(1.2 + 0.021, 6);
    expect(jobCost(model(), JOBS[0])).toBeNull();
  });
  it('times a 300-word answer and a person typing it', () => {
    expect(writeSeconds(model({ outputTokensPerSec: 100, ttftSeconds: 1 }))).toBeCloseTo(1 + 3.99, 6);
    expect(writeSeconds(model())).toBeNull();
    expect(humanSeconds(300)).toBe(450);
  });
  it('converts an Elo gap into a preference chance', () => {
    expect(winChance(1500, 1500)).toBeCloseTo(0.5);
    expect(winChance(1600, 1500)).toBeCloseTo(0.64, 2);
  });
});

describe('summarize', () => {
  it('leads with an overall verdict that matches the grade', () => {
    const m = model({ provider: 'Anthropic' });
    expect(summarize(m, [], 1, 10)).toMatch(/^The strongest model/);
    expect(summarize(m, [], 4, 10)).toMatch(/^A strong, above-average model/);
    expect(summarize(m, [], 10, 10)).toMatch(/^A lighter, budget-minded model/);
  });
});
