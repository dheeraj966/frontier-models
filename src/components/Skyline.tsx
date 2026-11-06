import { useEffect, useMemo, useRef, useState } from 'react';

export interface SkylineItem {
  id: string;
  name: string;
  short: string;
  color: string;
  /** 0–1: tower height. */
  value: number;
  /** Shown when the tower is focused. */
  display: string;
  dim?: boolean;
}

/* Isometric projection: x runs right-down, y runs left-down, z is up. */
const C = Math.cos(Math.PI / 6);
const S = 0.5;
const W = 30; // base width along x
const D = 30; // base depth along y
const STEP = 46; // distance between towers along -y (row climbs to the upper right)
const MAX_H = 170;
const MIN_H = 10;
const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * C, (x + y) * S - z];
const pts = (ps: [number, number, number][]) => ps.map(([x, y, z]) => iso(x, y, z).join(',')).join(' ');

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${ch(n >> 16)} ${ch((n >> 8) & 255)} ${ch(n & 255)})`;
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A city of models: each tower's height is the chosen metric; the row climbs from the
 * lowest (front left) to the highest (back right). Hover or focus a tower — or its row in
 * the list — to bring it forward while the rest falls out of focus.
 */
export default function Skyline({
  items,
  focus,
  onFocus,
  onOpen,
  label,
}: {
  items: SkylineItem[];
  focus: string | null;
  onFocus(id: string | null): void;
  /** Called when a tower is clicked or activated with Enter / Space. */
  onOpen?(id: string): void;
  label: string;
}) {
  // Ascending order: tallest ends up at the back right.
  const targets = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.value - b.value);
    return new Map(sorted.map((it, i) => [it.id, { pos: i, h: MIN_H + it.value * MAX_H }]));
  }, [items]);

  const [anim, setAnim] = useState(targets);
  const animRef = useRef(anim);
  animRef.current = anim;

  useEffect(() => {
    const from = animRef.current;
    if (reduceMotion()) {
      setAnim(targets);
      return;
    }
    const start = performance.now();
    const dur = 750;
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = ease(Math.min(1, (now - start) / dur));
      const next = new Map<string, { pos: number; h: number }>();
      for (const [id, to] of targets) {
        const f = from.get(id) ?? { pos: to.pos, h: 0 };
        next.set(id, { pos: f.pos + (to.pos - f.pos) * t, h: f.h + (to.h - f.h) * t });
      }
      setAnim(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targets]);

  const n = items.length;
  // Bounds for the viewBox (floor plate + tallest possible tower).
  const floorPad = 26;
  const floor: [number, number, number][] = [
    [-floorPad, -(n - 1) * STEP - floorPad, 0],
    [W + floorPad, -(n - 1) * STEP - floorPad, 0],
    [W + floorPad, D + floorPad, 0],
    [-floorPad, D + floorPad, 0],
  ];
  const fp = floor.map(([x, y, z]) => iso(x, y, z));
  const minX = Math.min(...fp.map((p) => p[0])) - 8;
  const maxX = Math.max(...fp.map((p) => p[0])) + 8;
  const minY = iso(0, -(n - 1) * STEP, MAX_H + MIN_H)[1] - 46;
  const maxY = Math.max(...fp.map((p) => p[1])) + 8;

  const byId = new Map(items.map((it) => [it.id, it]));
  const rankOf = new Map([...targets].map(([id, t]) => [id, n - t.pos]));
  const order = [...anim.entries()].filter(([id]) => byId.has(id)).sort((a, b) => b[1].pos - a[1].pos); // back → front

  return (
    <svg
      className="skyline"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      role="group"
      aria-label={label}
      onMouseLeave={() => onFocus(null)}
    >
      <defs>
        <linearGradient id="sky-floor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--floor-a)" />
          <stop offset="1" stopColor="var(--floor-b)" />
        </linearGradient>
        <filter id="sky-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id="sky-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* floor plate with grid lines for depth */}
      <polygon points={fp.map((p) => p.join(',')).join(' ')} fill="url(#sky-floor)" className="sky-floor" />
      {Array.from({ length: n + 1 }, (_, i) => {
        const y = D + floorPad - i * STEP - (STEP - D) / 2;
        const a = iso(-floorPad, y, 0);
        const b = iso(W + floorPad, y, 0);
        return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="sky-grid" />;
      })}

      {order.map(([id, { pos, h }]) => {
        const it = byId.get(id)!;
        const y0 = -pos * STEP;
        const isFocus = focus === id;
        const faded = focus !== null && !isFocus;
        const lift = isFocus ? 8 : 0;
        const top = pts([
          [0, y0, h + lift],
          [W, y0, h + lift],
          [W, y0 + D, h + lift],
          [0, y0 + D, h + lift],
        ]);
        const left = pts([
          [0, y0 + D, lift],
          [W, y0 + D, lift],
          [W, y0 + D, h + lift],
          [0, y0 + D, h + lift],
        ]);
        const right = pts([
          [W, y0, lift],
          [W, y0 + D, lift],
          [W, y0 + D, h + lift],
          [W, y0, h + lift],
        ]);
        const [sx, sy] = iso(W / 2, y0 + D / 2, 0);
        const [tx, ty] = iso(W / 2, y0 + D / 2, h + lift);
        // Rank number painted near the top of the right-hand face (never hidden by the tower in front).
        const fs = Math.max(10, Math.min(19, h * 0.62));
        const plate = iso(W, y0 + D / 2, lift + h - fs * 0.5 - 4);
        const street = iso(W + 5, y0 + D - 1, 0);
        const tagW = Math.max(96, Math.max(it.name.length * 6.6, it.display.length * 6) + 24);
        return (
          <g
            key={id}
            className={`tower${isFocus ? ' is-focus' : ''}${faded ? ' is-faded' : ''}${it.dim ? ' is-projected' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={`${it.name}: ${it.display}`}
            onMouseEnter={() => onFocus(id)}
            onFocus={() => onFocus(id)}
            onBlur={() => onFocus(null)}
            onClick={() => onOpen?.(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.(id);
              }
            }}
            filter={faded ? 'url(#sky-blur)' : undefined}
          >
            <ellipse cx={sx + 14} cy={sy + 6} rx={26} ry={11} className="tower-shadow" filter="url(#sky-shadow)" />
            <polygon points={left} fill={shade(it.color, -0.12)} />
            <polygon points={right} fill={shade(it.color, -0.38)} />
            <polygon points={top} fill={shade(it.color, 0.28)} />
            {/* windows: faint horizontal bands on the front face */}
            {Array.from({ length: Math.max(0, Math.floor((h - fs - 8) / 18)) }, (_, k) => (
              <polyline
                key={k}
                points={pts([
                  [3, y0 + D, lift + 9 + k * 18],
                  [W - 3, y0 + D, lift + 9 + k * 18],
                ])}
                className="tower-band"
              />
            ))}
            {/* rank painted on the side — matches the numbered list beside the city */}
            <text
              className="roof-label"
              transform={`matrix(${C} ${-S} 0 1 ${plate[0]} ${plate[1]})`}
              fontSize={fs}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {rankOf.get(id)}
            </text>
            {/* name painted on the street beside the tower (this strip is never hidden by another tower) */}
            <text
              className="street-label"
              transform={`matrix(${C} ${-S} ${C} ${S} ${street[0]} ${street[1]})`}
              dominantBaseline="hanging"
            >
              {it.short.length > 11 ? `${it.short.slice(0, 10)}…` : it.short}
            </text>
            {isFocus && (
              <g className="tower-tag" transform={`translate(${tx} ${ty - 14})`}>
                <rect x={-tagW / 2} y={-40} width={tagW} height={40} rx={9} />
                <text y={-24} textAnchor="middle" className="tag-name">
                  {it.name}
                </text>
                <text y={-10} textAnchor="middle" className="tag-value">
                  {it.display}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
