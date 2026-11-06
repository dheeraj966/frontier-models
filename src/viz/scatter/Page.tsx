import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Label,
  LabelList,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { useDataset } from '../../data/DatasetProvider';
import type { Benchmark } from '../../data/types';
import { buildScoreLookup, scoreOf, normalizeScore, compositeScore, formatScore } from '../../utils/scores';
import HiddenTable from '../../components/HiddenTable';
import { useChartTheme } from '../theme';
import { bool, list, oneOf, str, useUrlState } from '../../hooks/useUrlState';
import ChartActions from '../../components/ChartActions';

type CostMetric = 'in' | 'out';
const COMPOSITE = 'composite';

interface ScatterTooltipProps extends TooltipProps<number, string> {
  yBenchmark: Benchmark | null;
}

function ScatterTooltip({ active, payload, yBenchmark }: ScatterTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload as
    | {
        name: string;
        provider: string;
        status: string;
        baseline?: boolean;
        color: string;
        costIn?: number;
        costOut?: number;
        contextWindow?: number;
        y: number;
        raw: number | null;
      }
    | undefined;
  if (!p) return null;
  const money = (v?: number) => (v == null ? '—' : `$${v}`);
  const ctx = p.contextWindow == null ? '—' : `${Math.round(p.contextWindow / 1000)}k tokens`;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title chart-tooltip-name">
        <span className="dot" style={{ background: p.color }} />
        {p.name}
        {p.status === 'expected' ? ' (projected)' : ''}
        {p.baseline ? ' (baseline)' : ''}
      </p>
      <div className="chart-tooltip-row">
        <span>Provider</span>
        <span className="chart-tooltip-value">{p.provider}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>Input $/MTok</span>
        <span className="chart-tooltip-value">{money(p.costIn)}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>Output $/MTok</span>
        <span className="chart-tooltip-value">{money(p.costOut)}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>Context</span>
        <span className="chart-tooltip-value">{ctx}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>{yBenchmark ? yBenchmark.name : 'Composite'}</span>
        <span className="chart-tooltip-value">
          {yBenchmark && p.raw !== null ? formatScore(yBenchmark, p.raw) : `${p.y.toFixed(1)} / 100`}
          {yBenchmark && <span className="chart-tooltip-raw"> · scaled {p.y.toFixed(1)}</span>}
        </span>
      </div>
    </div>
  );
}

const LOG_TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

interface Point {
  id: string;
  name: string;
  provider: string;
  status: string;
  baseline?: boolean;
  color: string;
  cost: number;
  costIn?: number;
  costOut?: number;
  contextWindow: number;
  y: number;
  raw: number | null;
}

export default function ScatterPage() {
  const { models, benchmarks, scores } = useDataset();
  const chartTheme = useChartTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [costMetric, setCostMetric] = useUrlState<CostMetric>('cost', 'in', oneOf('in', 'out'));
  const [yMetric, setYMetric] = useUrlState('y', COMPOSITE, str);
  const [logScale, setLogScale] = useUrlState('log', true, bool);
  const [hiddenIds, setHiddenIds] = useUrlState('hide', [] as string[], list);
  const selected = useMemo(() => models.map((m) => m.id).filter((id) => !hiddenIds.includes(id)), [models, hiddenIds]);
  const [showFrontier, setShowFrontier] = useUrlState('frontier', true, bool);

  const lookup = useMemo(() => buildScoreLookup(scores), [scores]);
  const yBenchmark = yMetric === COMPOSITE ? null : (benchmarks.find((b) => b.id === yMetric) ?? null);

  const { points, missingScore, missingCost } = useMemo(() => {
    const pts: Point[] = [];
    const missingScore: string[] = [];
    const missingCost: string[] = [];
    for (const m of models) {
      if (!selected.includes(m.id)) continue;
      let y: number | null;
      let raw: number | null = null;
      if (yBenchmark) {
        raw = scoreOf(lookup, m.id, yBenchmark.id);
        y = raw === null ? null : normalizeScore(yBenchmark, raw);
      } else {
        y = compositeScore(benchmarks, lookup, m.id);
      }
      if (y === null) {
        missingScore.push(m.shortName);
        continue;
      }
      const cost = costMetric === 'in' ? m.costPerMTokIn : m.costPerMTokOut;
      if (cost === undefined) {
        missingCost.push(m.shortName);
        continue;
      }
      pts.push({
        id: m.id,
        name: m.shortName,
        provider: m.provider,
        status: m.status,
        baseline: m.baseline,
        color: m.color,
        cost,
        costIn: m.costPerMTokIn,
        costOut: m.costPerMTokOut,
        contextWindow: m.contextWindow ?? 0,
        y: Math.round(y * 10) / 10,
        raw,
      });
    }
    return { points: pts, missingScore, missingCost };
  }, [models, selected, costMetric, yBenchmark, lookup, benchmarks]);

  const logOk = logScale && points.length > 0 && points.every((p) => p.cost > 0);
  const costValues = points.map((p) => p.cost);
  const minCost = costValues.length ? Math.min(...costValues) : 0;
  const maxCost = costValues.length ? Math.max(...costValues) : 0;
  // Explicit padding so edge bubbles (and their labels) never get clipped by the plot box.
  const xDomain: [number, number] = logOk ? [minCost / 1.6, maxCost * 1.8] : [0, maxCost * 1.15 || 1];
  const logTicks = LOG_TICKS.filter((t) => t >= xDomain[0] && t <= xDomain[1]);

  // Value frontier: models no other plotted model beats on both price and score.
  const frontier = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.cost - b.cost || b.y - a.y);
    const out: Point[] = [];
    let best = -Infinity;
    for (const p of sorted)
      if (p.y > best) {
        out.push(p);
        best = p.y;
      }
    return out;
  }, [points]);
  const frontierIds = useMemo(() => new Set(frontier.map((p) => p.id)), [frontier]);

  // Nudge labels of near-coincident points above/below so names don't collide.
  const labelPos = useMemo(() => {
    const pos = new Map<string, 'right' | 'top' | 'bottom'>();
    const lx = (c: number) => (logOk ? Math.log10(c) : c / Math.max(1, ...points.map((p) => p.cost)));
    for (const a of points) {
      for (const b of points) {
        if (a.id >= b.id) continue;
        if (Math.abs(lx(a.cost) - lx(b.cost)) < 0.18 && Math.abs(a.y - b.y) < 4) {
          const [hi, lo] = a.y >= b.y ? [a, b] : [b, a];
          if (!pos.has(hi.id)) pos.set(hi.id, 'top');
          if (!pos.has(lo.id)) pos.set(lo.id, 'bottom');
        }
      }
    }
    return pos;
  }, [points, logOk]);

  const renderLabel = (props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    index?: number;
  }) => {
    const p = points[props.index ?? -1];
    if (!p) return null;
    const x = Number(props.x ?? 0),
      y = Number(props.y ?? 0),
      w = Number(props.width ?? 0),
      h = Number(props.height ?? 0);
    const cx = x + w / 2,
      cy = y + h / 2,
      r = w / 2;
    const where = labelPos.get(p.id) ?? 'right';
    const at =
      where === 'top'
        ? { x: cx, y: cy - r - 7, anchor: 'middle' as const }
        : where === 'bottom'
          ? { x: cx, y: cy + r + 15, anchor: 'middle' as const }
          : { x: cx + r + 7, y: cy + 4, anchor: 'start' as const };
    return (
      <text
        x={at.x}
        y={at.y}
        textAnchor={at.anchor}
        fill={chartTheme.label}
        fontSize={11}
        fontWeight={500}
        style={{
          paintOrder: 'stroke',
          stroke: chartTheme.labelHalo,
          strokeWidth: 3,
          strokeLinejoin: 'round',
          pointerEvents: 'none',
        }}
      >
        {p.name}
      </text>
    );
  };

  const yDomain = useMemo<[number, number]>(() => {
    if (!points.length) return [0, 100];
    const lo = Math.min(...points.map((p) => p.y));
    return [Math.max(0, Math.floor((lo - 8) / 10) * 10), 100];
  }, [points]);

  const toggleModel = (id: string) =>
    setHiddenIds((prev: string[]) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const hiddenHeaders = [
    'Model',
    'Provider',
    `Cost ${costMetric === 'in' ? 'input' : 'output'} ($/MTok)`,
    yBenchmark ? yBenchmark.name : 'Composite (0–100)',
  ];
  const hiddenRows = points.map((p) => [p.name, p.provider, p.cost, p.y.toFixed(1)]);

  return (
    <section>
      <div className="page-head">
        <p className="eyebrow">Scatter</p>
        <h1>Cost vs Performance</h1>
        <p className="page-sub">
          Cheaper is better → points toward the top-left are the value picks. y is{' '}
          {yBenchmark ? `scaled ${yBenchmark.name}` : 'composite (weighted mean of scaled scores)'}, 0–100. Bubble size = context
          window. The dashed line traces the value frontier. Click a bubble to open the model.
        </p>
      </div>

      <div className="toolbar">
        <div className="controls" role="group" aria-label="X-axis cost metric">
          <span className="controls-label">Cost</span>
          <div className="segmented">
            <button type="button" aria-pressed={costMetric === 'in'} onClick={() => setCostMetric('in')}>
              Input $/MTok
            </button>
            <button type="button" aria-pressed={costMetric === 'out'} onClick={() => setCostMetric('out')}>
              Output $/MTok
            </button>
          </div>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={logScale}
              onClick={() => setLogScale(true)}
              title="Logarithmic x-axis (falls back to linear when a non-positive cost exists)"
            >
              Log
            </button>
            <button type="button" aria-pressed={!logScale} onClick={() => setLogScale(false)}>
              Linear
            </button>
          </div>
          <button
            type="button"
            className={`chip ${showFrontier ? 'active' : ''}`}
            aria-pressed={showFrontier}
            onClick={() => setShowFrontier((v) => !v)}
          >
            Value frontier
          </button>
        </div>

        <div className="controls" role="group" aria-label="Y-axis metric">
          <span className="controls-label">Score</span>
          <button
            type="button"
            className={`chip ${yMetric === COMPOSITE ? 'active' : ''}`}
            aria-pressed={yMetric === COMPOSITE}
            onClick={() => setYMetric(COMPOSITE)}
          >
            Composite
          </button>
          {benchmarks.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`chip ${yMetric === b.id ? 'active' : ''}`}
              aria-pressed={yMetric === b.id}
              title={b.name}
              onClick={() => setYMetric(b.id)}
            >
              {b.shortName}
            </button>
          ))}
        </div>

        <div className="controls" role="group" aria-label="Toggle models">
          <span className="controls-label">Models</span>
          {models.map((m) => {
            const active = selected.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`chip model-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleModel(m.id)}
                title={m.name}
              >
                <span className="dot" style={{ background: m.color }} />
                {m.shortName}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel chart-panel" ref={chartRef}>
        <div className="panel-head">
          <h2 className="panel-title">
            {yBenchmark ? yBenchmark.name : 'Composite'} vs {costMetric === 'in' ? 'input' : 'output'} price
          </h2>
          <ChartActions target={chartRef} name="scatter" />
        </div>
        {points.length === 0 ? (
          <p className="placeholder">
            {missingScore.length + missingCost.length > 0
              ? 'All selected models are missing scores or costs for this view.'
              : 'All models are hidden. Toggle some models above to plot them.'}
          </p>
        ) : (
          <div className="chart-scroll">
            <div className="chart-min">
              <ResponsiveContainer width="100%" height={500}>
                <ScatterChart margin={{ top: 20, right: 72, left: 4, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis
                    type="number"
                    dataKey="cost"
                    name="Cost"
                    scale={logOk ? 'log' : 'linear'}
                    domain={xDomain}
                    allowDataOverflow
                    ticks={logOk && logTicks.length >= 2 ? logTicks : undefined}
                    tickFormatter={(v: number) => `$${v}`}
                    stroke={chartTheme.axis}
                    tickLine={false}
                    height={44}
                    tick={{ fill: chartTheme.tickMuted, fontSize: chartTheme.font }}
                  >
                    <Label
                      value={`Cost per MTok ${costMetric === 'in' ? 'input' : 'output'} (USD${logOk ? ', log' : ''}) →  cheaper on the left`}
                      position="insideBottom"
                      offset={-8}
                      fill={chartTheme.tick}
                      fontSize={12}
                    />
                  </XAxis>
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Score"
                    domain={yDomain}
                    stroke={chartTheme.axis}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tick={{ fill: chartTheme.tickMuted, fontSize: chartTheme.font }}
                  >
                    <Label
                      value="Scaled (0–100) ↑ better"
                      angle={-90}
                      position="insideLeft"
                      fill={chartTheme.tick}
                      fontSize={12}
                      style={{ textAnchor: 'middle' }}
                    />
                  </YAxis>
                  <ZAxis type="number" dataKey="contextWindow" range={[90, 420]} />
                  <Tooltip
                    content={<ScatterTooltip yBenchmark={yBenchmark} />}
                    cursor={{ strokeDasharray: '4 4', stroke: chartTheme.cursorStroke }}
                    wrapperStyle={{ zIndex: 10 }}
                  />
                  {showFrontier && frontier.length > 1 && (
                    <Scatter
                      data={frontier}
                      line={{ stroke: chartTheme.accent, strokeWidth: 1.5, strokeDasharray: '6 5', strokeOpacity: 0.7 }}
                      shape={() => <g />}
                      legendType="none"
                      isAnimationActive={false}
                    />
                  )}
                  <Scatter
                    data={points}
                    isAnimationActive={false}
                    style={{ cursor: 'pointer' }}
                    onClick={(p: { id?: string }) => p?.id && navigate(`/model/${encodeURIComponent(p.id)}`)}
                  >
                    {points.map((p) => (
                      <Cell
                        key={p.id}
                        fill={p.color}
                        fillOpacity={p.status === 'expected' || p.baseline ? 0.45 : 0.85}
                        stroke={
                          p.status === 'expected'
                            ? chartTheme.projectedStroke
                            : showFrontier && frontierIds.has(p.id)
                              ? chartTheme.label
                              : p.color
                        }
                        strokeOpacity={p.status === 'expected' ? 1 : showFrontier && frontierIds.has(p.id) ? 0.9 : 0.6}
                        strokeWidth={p.status === 'expected' ? 1.5 : 1.5}
                        strokeDasharray={p.status === 'expected' ? '4 3' : '0'}
                      />
                    ))}
                    <LabelList dataKey="name" content={renderLabel} />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {missingScore.length > 0 && <p className="footnote">Not evaluated (omitted): {missingScore.join(', ')}</p>}
        {missingCost.length > 0 && (
          <p className="footnote">
            Missing {costMetric === 'in' ? 'input' : 'output'} cost (omitted): {missingCost.join(', ')}
          </p>
        )}
        <div className="legend-row">
          <span>
            <i className="swatch-dashed" /> outline = expected / projected
          </span>
          <span>
            <i className="swatch-faint" /> faded = expected or baseline
          </span>
          {showFrontier && (
            <span>
              <i className="swatch-dashed" style={{ borderColor: '#7aa2ff' }} /> value frontier (white ring = on frontier)
            </span>
          )}
        </div>
      </div>

      <HiddenTable
        caption={`Cost vs ${yBenchmark ? yBenchmark.name : 'composite'} scatter values`}
        headers={hiddenHeaders}
        rows={hiddenRows}
      />
    </section>
  );
}
