import { useEffect, useRef, useState } from 'react';
import type { Model } from '../data/types';
import { ModelAvatar } from './ui';
import { HUMAN_WPM, booksAtOnce, booksText, duration, humanSeconds, writeSeconds } from '../utils/human';
import Icon from './Icon';

/** "X out of 100" grid — the most widely understood way to show a proportion. */
export function IconArray({
  value,
  compare,
  color,
  label,
}: {
  value: number;
  compare?: number | null;
  color: string;
  label: string;
}) {
  const filled = Math.round(Math.max(0, Math.min(100, value)));
  const ref = compare == null ? null : Math.round(Math.max(0, Math.min(100, compare)));
  return (
    <div className="icon-array" role="img" aria-label={label}>
      {Array.from({ length: 100 }, (_, i) => {
        const on = i < filled;
        const isRef = ref !== null && i === ref - 1;
        return (
          <span
            key={i}
            className={`ia-dot${on ? ' on' : ''}${isRef ? ' ref' : ''}`}
            style={on ? { background: color, transitionDelay: `${i * 6}ms` } : { transitionDelay: `${i * 6}ms` }}
          />
        );
      })}
    </div>
  );
}

const SAMPLE =
  'Here is a clear, friendly answer to your question. First, the short version: it depends on what you need. If you care most about cost, start with the cheaper model and only upgrade when the answers stop being good enough. ';

/** Every model "types" the same 300-word answer at its real speed (time-compressed), next to a person. */
export function TypingRace({ models, words = 300 }: { models: Model[]; words?: number }) {
  const lanes = models
    .map((m) => ({ m, sec: writeSeconds(m, words) }))
    .filter((l): l is { m: Model; sec: number } => l.sec != null)
    .sort((a, b) => a.sec - b.sec)
    .slice(0, 6);
  const human = humanSeconds(words);
  const slowest = Math.max(...lanes.map((l) => l.sec), 1);
  const [t, setT] = useState(0); // seconds of simulated time
  const [running, setRunning] = useState(false);
  const raf = useRef(0);
  const scale = slowest / 3.2; // compress so the slowest model finishes in ~3 s

  const run = () => {
    cancelAnimationFrame(raf.current);
    setRunning(true);
    setT(0);
    const start = performance.now();
    const tick = (now: number) => {
      const sim = ((now - start) / 1000) * scale;
      setT(sim);
      if (sim < slowest * 1.02) raf.current = requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Start the race by itself the first time it scrolls into view.
  const box = useRef<HTMLDivElement>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const finishRef = useRef(() => setT(slowest * 1.02));
  finishRef.current = () => setT(slowest * 1.02);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) finishRef.current();
        else runRef.current();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!lanes.length) return <p className="muted">Speed figures appear once a live source is connected.</p>;

  const lane = (key: string, who: React.ReactNode, name: string, sec: number, color: string, isHuman = false) => {
    const p = Math.min(1, t / sec);
    const done = t >= sec;
    return (
      <li key={key} className={`race-lane${done ? ' done' : ''}${isHuman ? ' human' : ''}`}>
        <span className="race-who">
          {who}
          <span className="race-name">{name}</span>
        </span>
        <span className="race-track">
          <span className="race-fill" style={{ width: `${p * 100}%`, background: color }} />
          <span className="race-text">{SAMPLE.slice(0, Math.floor(p * SAMPLE.length))}</span>
        </span>
        <span className="race-time">{done ? duration(sec) : running ? duration(Math.min(t, sec)) : duration(sec)}</span>
      </li>
    );
  };

  return (
    <div className="race" ref={box}>
      <ol className="race-lanes">
        {lanes.map(({ m, sec }) => lane(m.id, <ModelAvatar model={m} size={22} />, m.shortName, sec, m.color))}
        {lane(
          'human',
          <span className="avatar human-avatar" style={{ width: 22, height: 22 }}>
            <Icon name="user" size={12} />
          </span>,
          `You (${HUMAN_WPM} wpm)`,
          human,
          'var(--text-3)',
          true,
        )}
      </ol>
      <div className="race-foot">
        <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
          <Icon name="rocket" size={14} /> {t > 0 ? 'Race again' : 'Start the race'}
        </button>
        <span className="muted">
          A {words}-word answer. The race is sped up; times shown are real. A person typing would still be going for{' '}
          {duration(human)}.
        </span>
      </div>
    </div>
  );
}

/** Context window drawn as a stack of 300-page books. */
export function BookStacks({ models }: { models: Model[] }) {
  const rows = models
    .map((m) => ({ m, b: booksAtOnce(m) }))
    .filter((r): r is { m: Model; b: number } => r.b != null)
    .sort((a, b) => b.b - a.b);
  const max = Math.max(...rows.map((r) => r.b), 1);
  const cap = 18;
  return (
    <ul className="books">
      {rows.map(({ m, b }) => {
        const n = Math.min(cap, Math.max(1, Math.round(b)));
        return (
          <li key={m.id} className="book-col">
            <span className="book-count">{booksText(b)}</span>
            <span className="book-stack" style={{ height: `${(Math.min(b, cap) / Math.min(max, cap)) * 150 + 10}px` }}>
              {Array.from({ length: n }, (_, i) => (
                <span
                  key={i}
                  className="book"
                  style={{ background: m.color, transform: `translateX(${(i % 3) - 1}px) rotate(${((i * 37) % 7) - 3}deg)` }}
                />
              ))}
            </span>
            <span className="book-name">
              <ModelAvatar model={m} size={18} />
              {m.shortName}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Running best score over time as a staircase, annotated where it jumped. */
export function FrontierSteps({ points }: { points: { t: number; y: number; label: string; color: string }[] }) {
  if (points.length < 2) return null;
  const W = 720;
  const H = 220;
  const pad = { l: 36, r: 20, t: 28, b: 28 };
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t + (points[points.length - 1].t - t0) * 0.12;
  const lo = Math.floor(Math.min(...points.map((p) => p.y)) - 2);
  const hi = Math.ceil(Math.max(...points.map((p) => p.y)) + 1);
  const X = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (H - pad.t - pad.b);
  let d = `M ${X(points[0].t)} ${Y(points[0].y)}`;
  points.slice(1).forEach((p, i) => {
    d += ` H ${X(p.t)} V ${Y(p.y)}`;
    void i;
  });
  d += ` H ${X(t1)}`;
  const area = `${d} V ${H - pad.b} H ${X(points[0].t)} Z`;
  return (
    <svg className="steps-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Best score available over time">
      <defs>
        <linearGradient id="steps-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} className="steps-grid" />
          <text x={pad.l - 8} y={Y(v)} className="steps-axis" textAnchor="end" dominantBaseline="central">
            {v.toFixed(0)}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#steps-fill)" />
      <path d={d} className="steps-line" />
      {points.map((p, i) => (
        <g key={p.label + i} transform={`translate(${X(p.t)} ${Y(p.y)})`}>
          <circle r={6} fill={p.color} className="steps-dot" />
          <text y={-12} textAnchor="middle" className="steps-label">
            {p.label}
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={`d${i}`} x={X(p.t)} y={H - 8} textAnchor="middle" className="steps-axis">
          {new Date(p.t).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })}
        </text>
      ))}
    </svg>
  );
}
