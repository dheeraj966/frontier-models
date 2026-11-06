import type { Benchmark, Model } from '../data/types';
import { blendedPrice } from './insights';

/**
 * Plain-language layer. Research behind it:
 *  - Re-expressing numbers in familiar units ("perspectives") improves understanding and recall
 *    (Barrio, Goldstein & Hofman, CHI 2016).
 *  - "X out of 100" icon arrays help people with low numeracy read proportions
 *    (Galesic, Garcia-Retamero & Gigerenzer, 2009).
 * Every helper here turns a raw metric into something a non-expert can picture.
 */

export interface Skill {
  /** Benchmark id this skill reads from. */
  id: string;
  name: string;
  icon: string;
  /** "out of 100 …" — what one item of the benchmark is, in everyday words. */
  unit: string;
  /** One sentence anyone understands. */
  plain: string;
}

export const SKILLS: Skill[] = [
  {
    id: 'swe-bench-verified',
    name: 'Fixing code',
    icon: 'code',
    unit: 'real software bugs fixed',
    plain: 'Given a real bug report from an open-source project, can it write a fix that passes the project’s tests?',
  },
  {
    id: 'gpqa-diamond',
    name: 'Expert science',
    icon: 'flask',
    unit: 'PhD-level science questions right',
    plain: 'Biology, chemistry and physics questions written by PhDs to be impossible to just look up.',
  },
  {
    id: 'aime-2025',
    name: 'Hard math',
    icon: 'sigma',
    unit: 'competition math problems solved',
    plain: 'Problems from a US high-school olympiad qualifier that most strong students can’t solve.',
  },
  {
    id: 'mmlu-pro',
    name: 'General knowledge',
    icon: 'book',
    unit: 'university exam questions right',
    plain: 'Multiple-choice exam questions across 14 subjects, with ten answer options each.',
  },
  {
    id: 'livecodebench',
    name: 'Coding puzzles',
    icon: 'code',
    unit: 'fresh programming puzzles solved',
    plain: 'New competitive-programming problems published after the model was trained, so it can’t have memorised them.',
  },
  {
    id: 'mmmu-pro',
    name: 'Reading images',
    icon: 'image',
    unit: 'questions about charts & diagrams right',
    plain: 'College questions that can only be answered by reading a picture, chart or diagram.',
  },
  {
    id: 'tau2-bench',
    name: 'Doing tasks',
    icon: 'bolt',
    unit: 'customer-service tasks completed',
    plain: 'Acting as an agent: chatting with a simulated customer and using tools to actually finish the job.',
  },
];

export const skillFor = (benchmarkId: string) => SKILLS.find((s) => s.id === benchmarkId);

/** Relative grade inside the field (rank 1 of n = A+). */
export function gradeFor(rank: number | undefined, total: number): { letter: string; tone: string; words: string } {
  if (!rank || total <= 0) return { letter: '–', tone: 'none', words: 'not tested' };
  if (rank === 1) return { letter: 'A+', tone: 'a', words: 'best of all' };
  const p = (rank - 1) / Math.max(1, total - 1);
  if (p <= 0.25) return { letter: 'A', tone: 'a', words: 'among the best' };
  if (p <= 0.5) return { letter: 'B', tone: 'b', words: 'above average' };
  if (p <= 0.75) return { letter: 'C', tone: 'c', words: 'below average' };
  return { letter: 'D', tone: 'd', words: 'near the bottom' };
}

/* ── Everyday units ─────────────────────────────────────────────────────── */

export const TOKENS_PER_WORD = 1.33;
/** A 300-page book ≈ 90k words ≈ 120k tokens. */
export const BOOK_TOKENS = 120_000;

export interface Job {
  id: string;
  title: string;
  detail: string;
  inTok: number;
  outTok: number;
  icon: string;
}

export const JOBS: Job[] = [
  {
    id: 'book',
    title: 'Summarise a 300-page book',
    detail: 'reads ~90,000 words, writes a 1-page summary',
    inTok: BOOK_TOKENS,
    outTok: 700,
    icon: 'book',
  },
  {
    id: 'emails',
    title: 'Answer 1,000 customer emails',
    detail: '~300 words in, ~200 words out, each',
    inTok: 400_000,
    outTok: 266_000,
    icon: 'workflow',
  },
  {
    id: 'report',
    title: 'Write a 40-page report',
    detail: '~20,000 words from a short brief',
    inTok: 3_000,
    outTok: 26_600,
    icon: 'file',
  },
];

export function jobCost(m: Model, job: Job): number | null {
  if (m.costPerMTokIn == null || m.costPerMTokOut == null) return null;
  return (job.inTok * m.costPerMTokIn + job.outTok * m.costPerMTokOut) / 1_000_000;
}

export function money(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v < 0.01) return '< 1¢';
  if (v < 1) return `${Math.round(v * 100)}¢`;
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString()}`;
}

/** Seconds to write `words` words: time to first token + generation. */
export function writeSeconds(m: Model, words = 300): number | null {
  if (!m.outputTokensPerSec) return null;
  return (m.ttftSeconds ?? 0) + (words * TOKENS_PER_WORD) / m.outputTokensPerSec;
}

/** A person typing at ~40 words per minute. */
export const HUMAN_WPM = 40;
export const humanSeconds = (words = 300) => (words / HUMAN_WPM) * 60;

export function duration(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}

export const booksAtOnce = (m: Model) => (m.contextWindow ? m.contextWindow / BOOK_TOKENS : null);

export function booksText(b: number | null): string {
  if (b == null) return '—';
  if (b < 1) return `${Math.round(b * 300)} pages`;
  return `${b < 10 ? +b.toFixed(1) : Math.round(b)} book${b >= 1.05 ? 's' : ''}`;
}

/** Elo gap → chance the first model's answer is preferred by a person. */
export const winChance = (eloA: number, eloB: number) => 1 / (1 + 10 ** ((eloB - eloA) / 400));

/* ── Sentences ──────────────────────────────────────────────────────────── */

const pct = (a: number, b: number) => Math.round((a / b) * 100);

export function valueIndex(m: Model, composite: number | null): number | null {
  const p = blendedPrice(m);
  if (p == null || composite == null) return null;
  return composite / Math.log2(2 + p);
}

/** One-line description of a model for its report card. */
export function summarize(m: Model, grades: { skill: Skill; letter: string }[], overallRank?: number, total?: number): string {
  const strong = grades.filter((g) => g.letter === 'A+' || g.letter === 'A').map((g) => g.skill.name.toLowerCase());
  const weak = grades.filter((g) => g.letter === 'D').map((g) => g.skill.name.toLowerCase());
  const g = gradeFor(overallRank, total ?? 0);
  const lead =
    overallRank === 1
      ? 'The strongest model tracked here'
      : g.tone === 'a'
        ? 'One of the strongest models here'
        : g.tone === 'b'
          ? 'A strong, above-average model'
          : g.tone === 'c'
            ? 'A solid middle-of-the-pack model'
            : g.tone === 'd'
              ? 'A lighter, budget-minded model'
              : 'A model we have not fully tested yet';
  const parts = [`${lead}, from ${m.provider}.`];
  if (strong.length) parts.push(`Best at ${list(strong.slice(0, 3))}.`);
  if (weak.length) parts.push(`Weaker at ${list(weak.slice(0, 2))}.`);
  if (m.status === 'expected') parts.push('Not released yet — these are projections.');
  return parts.join(' ');
}

export function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

export function compareSentence(
  top: { name: string; value: number },
  second: { name: string; value: number } | undefined,
  unit = '',
): string {
  if (!second) return `${top.name} leads.`;
  const gap = top.value - second.value;
  const close = gap < 1.5 ? 'only just' : gap < 4 ? 'clearly' : 'by a wide margin';
  return `${top.name} leads ${close} — ${top.value.toFixed(1)}${unit} vs ${second.value.toFixed(1)}${unit} for ${second.name}.`;
}

export const share = (part: number, whole: number) => `${pct(part, whole)}%`;

/** Describe a benchmark of a given category in plain words for tooltips. */
export function plainBenchmark(b: Benchmark): string {
  return skillFor(b.id)?.plain ?? b.description ?? b.name;
}
