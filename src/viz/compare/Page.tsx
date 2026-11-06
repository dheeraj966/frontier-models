import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useDataset } from '../../data/DatasetProvider';
import type { Model } from '../../data/types';
import { formatScore, normalizeScore, rankBy, scoreOf } from '../../utils/scores';
import { list, useUrlState } from '../../hooks/useUrlState';
import { useChartTheme } from '../theme';
import ChartActions from '../../components/ChartActions';
import HiddenTable from '../../components/HiddenTable';
import Icon from '../../components/Icon';

const MAX = 4;

interface ExtraRow {
  label: string;
  get(m: Model): number | undefined;
  fmt(v: number): string;
  better: 'lower' | 'higher';
}
const EXTRA: ExtraRow[] = [
  { label: 'Input $/MTok', get: (m) => m.costPerMTokIn, fmt: (v) => `$${v}`, better: 'lower' },
  { label: 'Output $/MTok', get: (m) => m.costPerMTokOut, fmt: (v) => `$${v}`, better: 'lower' },
  { label: 'Output speed', get: (m) => m.outputTokensPerSec, fmt: (v) => `${Math.round(v)} tok/s`, better: 'higher' },
  { label: 'First token', get: (m) => m.ttftSeconds, fmt: (v) => `${v.toFixed(2)} s`, better: 'lower' },
  {
    label: 'Context',
    get: (m) => m.contextWindow,
    fmt: (v) => (v >= 1e6 ? `${v / 1e6}M` : `${Math.round(v / 1000)}k`),
    better: 'higher',
  },
];

export default function ComparePage() {
  const { models, benchmarks, lookup, composites } = useDataset();
  const ct = useChartTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const ranks = useMemo(() => rankBy(composites), [composites]);

  const defaults = useMemo(
    () =>
      [...models]
        .filter((m) => composites.get(m.id) != null)
        .sort((a, b) => composites.get(b.id)! - composites.get(a.id)!)
        .slice(0, 2)
        .map((m) => m.id),
    [models, composites],
  );
  const [picked, setPicked] = useUrlState('m', defaults, list);
  const sel = useMemo(
    () =>
      picked
        .map((id) => models.find((m) => m.id === id))
        .filter((m): m is Model => Boolean(m))
        .slice(0, MAX),
    [picked, models],
  );
  const anchor = sel[0];

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX ? prev : [...prev, id]));
  const makeAnchor = (id: string) => setPicked((prev) => [id, ...prev.filter((x) => x !== id)]);

  const table = useMemo(
    () =>
      benchmarks.map((b) => {
        const vals = sel.map((m) => scoreOf(lookup, m.id, b.id));
        const scaled = vals.map((v) => (v === null ? null : normalizeScore(b, v)));
        const best = Math.max(...scaled.filter((x): x is number => x !== null));
        return { b, vals, scaled, winners: scaled.map((s) => s !== null && sel.length > 1 && Math.abs(s - best) < 1e-9) };
      }),
    [benchmarks, sel, lookup],
  );
  const wins = sel.map((_, i) => table.filter((r) => r.winners[i]).length);
  const topWins = Math.max(0, ...wins);

  const radarData = benchmarks.map((b) => {
    const row: Record<string, string | number | null> = { axis: b.shortName };
    for (const m of sel) {
      const v = scoreOf(lookup, m.id, b.id);
      row[m.id] = v === null ? null : Math.round(normalizeScore(b, v) * 10) / 10;
    }
    return row;
  });
  const lo = Math.min(
    100,
    ...radarData.flatMap((r) => sel.map((m) => r[m.id])).filter((v): v is number => typeof v === 'number'),
  );
  const floor = Math.max(0, Math.min(80, Math.floor((lo - 5) / 10) * 10));

  return (
    <section>
      <div className="page-head">
        <p className="eyebrow">Compare</p>
        <h1>Head to Head</h1>
        <p className="page-sub">
          Pick up to {MAX} models. The first one is the reference; differences are shown against it. The link in your address bar
          shares this exact comparison.
        </p>
      </div>

      <div className="toolbar">
        <div className="controls" role="group" aria-label="Models to compare">
          <span className="controls-label">Models</span>
          {models.map((m) => {
            const on = picked.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`chip model-chip ${on ? 'active' : ''}`}
                aria-pressed={on}
                disabled={!on && picked.length >= MAX}
                onClick={() => toggle(m.id)}
                title={!on && picked.length >= MAX ? `Up to ${MAX} models` : m.name}
              >
                <span className="dot" style={{ background: m.color }} />
                {m.shortName}
                {on && picked[0] === m.id && <span className="chip-tag chip-tag-base">ref</span>}
              </button>
            );
          })}
        </div>
      </div>

      {sel.length < 2 ? (
        <div className="panel">
          <p className="placeholder">Select at least two models to compare.</p>
        </div>
      ) : (
        <>
          <div className="compare-cards" style={{ ['--cols' as string]: sel.length }}>
            {sel.map((m, i) => {
              const c = composites.get(m.id) ?? null;
              const d =
                i > 0 && c !== null && anchor && composites.get(anchor.id) != null ? c - composites.get(anchor.id)! : null;
              return (
                <div
                  key={m.id}
                  className={`panel compare-card ${wins[i] === topWins && topWins > 0 ? 'is-leader' : ''}`}
                  style={{ ['--model' as string]: m.color }}
                >
                  <div className="compare-card-head">
                    <span className="dot" style={{ background: m.color }} />
                    <Link to={`/model/${encodeURIComponent(m.id)}`} className="compare-name">
                      {m.name}
                    </Link>
                    {i === 0 ? (
                      <span className="chip-tag chip-tag-base">ref</span>
                    ) : (
                      <button type="button" className="link-btn" onClick={() => makeAnchor(m.id)}>
                        Make reference
                      </button>
                    )}
                  </div>
                  <div className="compare-score">
                    <b>{c === null ? '—' : c.toFixed(1)}</b>
                    {d !== null && (
                      <span className={`delta ${d >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                        {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="compare-meta">
                    <span>{ranks.get(m.id) ? `#${ranks.get(m.id)} overall` : 'unranked'}</span>
                    <span>
                      <b>{wins[i]}</b> / {benchmarks.length} wins
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="viz-split compare-split">
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Per benchmark</h2>
                <span className="panel-hint">raw score · bold = best · Δ vs {anchor?.shortName}</span>
              </div>
              <div className="table-scroll inner">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th scope="col" className="sticky-col">
                        Benchmark
                      </th>
                      {sel.map((m) => (
                        <th key={m.id} scope="col">
                          <span className="dot" style={{ background: m.color }} /> {m.shortName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.map(({ b, vals, scaled, winners }) => (
                      <tr key={b.id}>
                        <th scope="row" className="sticky-col" title={b.name}>
                          {b.shortName}
                        </th>
                        {sel.map((m, i) => {
                          const v = vals[i];
                          const diff = i > 0 && v !== null && vals[0] !== null ? v - (vals[0] as number) : null;
                          return (
                            <td key={m.id} className={winners[i] ? 'is-win' : ''}>
                              {v === null ? <span className="muted">—</span> : formatScore(b, v)}
                              {diff !== null && Math.abs(diff) > 1e-9 && (
                                <span className={`cmp-diff ${diff > 0 ? 'delta-pos' : 'delta-neg'}`}>
                                  {diff > 0 ? '+' : '−'}
                                  {b.unit === 'elo' ? Math.round(Math.abs(diff)) : Math.abs(diff).toFixed(1)}
                                </span>
                              )}
                              {scaled[i] !== null && (
                                <span className="cmp-bar">
                                  <span style={{ width: `${scaled[i]}%`, background: m.color }} />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {EXTRA.map((x) => {
                      const vals = sel.map((m) => x.get(m));
                      const nums = vals.filter((v): v is number => v != null);
                      const best = nums.length > 1 ? (x.better === 'lower' ? Math.min(...nums) : Math.max(...nums)) : null;
                      return (
                        <tr key={x.label} className="extra-row">
                          <th scope="row" className="sticky-col">
                            {x.label}
                          </th>
                          {vals.map((v, i) => (
                            <td key={sel[i].id} className={v != null && v === best ? 'is-win' : ''}>
                              {v == null ? <span className="muted">—</span> : x.fmt(v)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel chart-panel" ref={chartRef}>
              <div className="panel-head">
                <h2 className="panel-title">Shape</h2>
                <ChartActions target={chartRef} name="compare" />
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke={ct.grid} />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: ct.tick, fontSize: 11 }} />
                  <PolarRadiusAxis
                    domain={[floor, 100]}
                    allowDataOverflow
                    tick={{ fill: ct.tickMuted, fontSize: 9 }}
                    axisLine={false}
                    tickCount={3}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  {sel.map((m) => (
                    <Radar
                      key={m.id}
                      dataKey={m.id}
                      name={m.shortName}
                      stroke={m.color}
                      fill={m.color}
                      fillOpacity={0.14}
                      strokeWidth={2.25}
                      isAnimationActive={false}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
              <p className="footnote">
                <Icon name="info" size={12} /> Radial axis {floor}–100 (scaled scores).
              </p>
            </div>
          </div>
        </>
      )}

      <HiddenTable
        caption="Head-to-head raw scores"
        headers={['Benchmark', ...sel.map((m) => m.name)]}
        rows={table.map((r) => [r.b.name, ...r.vals.map((v) => (v === null ? null : formatScore(r.b, v)))])}
      />
    </section>
  );
}
