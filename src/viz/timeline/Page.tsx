import { useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { useDataset } from '../../data/DatasetProvider';
import { normalizeScore, scoreOf, formatScore } from '../../utils/scores';
import { fmtDate, toDay } from '../../utils/time';
import { list, str, useUrlState } from '../../hooks/useUrlState';
import { useChartTheme } from '../theme';
import ChartActions from '../../components/ChartActions';
import HiddenTable from '../../components/HiddenTable';

const DAY = 86_400_000;
const COMPOSITE = 'composite';

interface Pt {
  id: string;
  name: string;
  provider: string;
  color: string;
  t: number;
  y: number;
  raw: number | null;
  record: boolean;
}

function TimelineTooltip({ active, payload, metric }: TooltipProps<number, string> & { metric: string }) {
  const p = payload?.[0]?.payload as Pt | undefined;
  if (!active || !p || !p.id) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title chart-tooltip-name">
        <span className="dot" style={{ background: p.color }} />
        {p.name}
      </p>
      <div className="chart-tooltip-row">
        <span>Released</span>
        <span className="chart-tooltip-value">{fmtDate(new Date(p.t).toISOString())}</span>
      </div>
      <div className="chart-tooltip-row">
        <span>{metric}</span>
        <span className="chart-tooltip-value">{p.y.toFixed(1)} / 100</span>
      </div>
      {p.record && (
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-raw">Set a new frontier record</span>
        </div>
      )}
    </div>
  );
}

export default function TimelinePage() {
  const { models, benchmarks, lookup, composites } = useDataset();
  const ct = useChartTheme();
  const navigate = useNavigate();
  const chartRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useUrlState('y', COMPOSITE, str);
  const [hidden, setHidden] = useUrlState('hide', [] as string[], list);
  const bench = metric === COMPOSITE ? null : (benchmarks.find((b) => b.id === metric) ?? null);
  const metricLabel = bench ? `${bench.shortName} (scaled)` : 'Composite';

  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))], [models]);
  const provColor = useMemo(
    () => new Map(providers.map((p) => [p, models.find((m) => m.provider === p)!.color])),
    [providers, models],
  );

  const { points, frontier, records, upcoming } = useMemo(() => {
    const pts: Pt[] = [];
    for (const m of models) {
      if (!m.releaseDate || hidden.includes(m.provider)) continue;
      let y: number | null;
      let raw: number | null = null;
      if (bench) {
        raw = scoreOf(lookup, m.id, bench.id);
        y = raw === null ? null : normalizeScore(bench, raw);
      } else y = composites.get(m.id) ?? null;
      if (y === null) continue;
      pts.push({
        id: m.id,
        name: m.shortName,
        provider: m.provider,
        color: m.color,
        t: toDay(m.releaseDate),
        y: Math.round(y * 10) / 10,
        raw,
        record: false,
      });
    }
    pts.sort((a, b) => a.t - b.t || b.y - a.y);
    const recs: (Pt & { gain: number | null; held: number | null })[] = [];
    let best = -Infinity;
    for (const p of pts) {
      if (p.y > best) {
        p.record = true;
        recs.push({ ...p, gain: Number.isFinite(best) ? p.y - best : null, held: null });
        best = p.y;
      }
    }
    recs.forEach((r, i) => {
      r.held = i < recs.length - 1 ? Math.round((recs[i + 1].t - r.t) / DAY) : null;
    });
    // Step line: hold each record flat until the next one.
    const line: { t: number; y: number }[] = [];
    recs.forEach((r, i) => {
      if (i > 0) line.push({ t: r.t, y: recs[i - 1].y });
      line.push({ t: r.t, y: r.y });
    });
    if (recs.length) line.push({ t: Math.max(...pts.map((p) => p.t)) + 20 * DAY, y: recs[recs.length - 1].y });
    const up = models.filter((m) => !m.releaseDate && !hidden.includes(m.provider));
    return { points: pts, frontier: line, records: recs, upcoming: up };
  }, [models, hidden, bench, lookup, composites]);

  const tMin = points.length ? Math.min(...points.map((p) => p.t)) - 25 * DAY : 0;
  const tMax = points.length ? Math.max(...points.map((p) => p.t)) + 25 * DAY : 1;
  const yLo = points.length ? Math.max(0, Math.floor((Math.min(...points.map((p) => p.y)) - 6) / 10) * 10) : 0;
  const ticks = useMemo(() => {
    const out: number[] = [];
    const d = new Date(tMin);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const span = (tMax - tMin) / DAY;
    const step = span > 500 ? 3 : span > 200 ? 2 : 1;
    while (d.getTime() <= tMax) {
      out.push(d.getTime());
      d.setUTCMonth(d.getUTCMonth() + step);
    }
    return out;
  }, [tMin, tMax]);

  const toggleProvider = (p: string) => setHidden((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  return (
    <section>
      <div className="page-head">
        <p className="eyebrow">Timeline</p>
        <h1>Frontier Progress</h1>
        <p className="page-sub">
          Each dot is a model at its release date. The stepped line is the frontier record — the best{' '}
          {bench ? bench.name : 'composite'} available on any given day. Click a dot to open the model.
        </p>
      </div>

      <div className="toolbar">
        <div className="controls" role="group" aria-label="Metric">
          <span className="controls-label">Score</span>
          <button
            type="button"
            className={`chip ${metric === COMPOSITE ? 'active' : ''}`}
            aria-pressed={metric === COMPOSITE}
            onClick={() => setMetric(COMPOSITE)}
          >
            Composite
          </button>
          {benchmarks.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`chip ${metric === b.id ? 'active' : ''}`}
              aria-pressed={metric === b.id}
              title={b.name}
              onClick={() => setMetric(b.id)}
            >
              {b.shortName}
            </button>
          ))}
        </div>
        <div className="controls" role="group" aria-label="Providers">
          <span className="controls-label">Labs</span>
          {providers.map((p) => {
            const on = !hidden.includes(p);
            return (
              <button
                key={p}
                type="button"
                className={`chip model-chip ${on ? 'active' : ''}`}
                aria-pressed={on}
                onClick={() => toggleProvider(p)}
              >
                <span className="dot" style={{ background: provColor.get(p) }} />
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel chart-panel" ref={chartRef}>
        <div className="panel-head">
          <h2 className="panel-title">{metricLabel} by release date</h2>
          <ChartActions target={chartRef} name="timeline" />
        </div>
        {points.length === 0 ? (
          <p className="placeholder">No released models with this score.</p>
        ) : (
          <div className="chart-scroll">
            <div className="chart-min">
              <ResponsiveContainer width="100%" height={440}>
                <ScatterChart margin={{ top: 24, right: 40, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis
                    type="number"
                    dataKey="t"
                    domain={[tMin, tMax]}
                    ticks={ticks}
                    scale="time"
                    stroke={ct.axis}
                    tickLine={false}
                    tick={{ fill: ct.tickMuted, fontSize: 12 }}
                    tickFormatter={(v: number) =>
                      new Date(v).toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })
                    }
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[yLo, 100]}
                    stroke={ct.axis}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fill: ct.tickMuted, fontSize: 12 }}
                  />
                  <ZAxis range={[110, 110]} />
                  <Tooltip
                    content={<TimelineTooltip metric={metricLabel} />}
                    cursor={{ strokeDasharray: '4 4', stroke: ct.cursorStroke }}
                    wrapperStyle={{ zIndex: 10 }}
                  />
                  <Scatter
                    data={frontier}
                    line={{ stroke: ct.accent, strokeWidth: 2, strokeOpacity: 0.65 }}
                    shape={() => <g />}
                    legendType="none"
                    isAnimationActive={false}
                  />
                  <Scatter
                    data={points}
                    isAnimationActive={false}
                    onClick={(p: { id?: string }) => p?.id && navigate(`/model/${encodeURIComponent(p.id)}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {points.map((p) => (
                      <Cell
                        key={p.id}
                        fill={p.color}
                        fillOpacity={0.9}
                        stroke={p.record ? ct.label : p.color}
                        strokeWidth={p.record ? 2 : 1}
                      />
                    ))}
                    <LabelList
                      dataKey="name"
                      position="top"
                      offset={10}
                      fill={ct.label}
                      stroke="none"
                      fontSize={11}
                      fontWeight={500}
                    />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="legend-row">
          <span>
            <i className="swatch-dashed" style={{ borderTopStyle: 'solid', borderColor: ct.accent }} /> frontier record
          </span>
          <span>ringed dot = set a new record</span>
          {upcoming.length > 0 && (
            <span>
              Upcoming (no date):{' '}
              {upcoming.map((m) => (
                <Link key={m.id} to={`/model/${encodeURIComponent(m.id)}`} className="inline-chip">
                  <span className="dot" style={{ background: m.color }} />
                  {m.shortName}
                </Link>
              ))}
            </span>
          )}
        </div>
      </div>

      {records.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Record history</h2>
            <span className="panel-hint">{records.length} times the frontier moved</span>
          </div>
          <ol className="record-list">
            {[...records].reverse().map((r) => (
              <li key={r.id}>
                <span className="record-date">{fmtDate(new Date(r.t).toISOString())}</span>
                <span className="dot" style={{ background: r.color }} />
                <Link to={`/model/${encodeURIComponent(r.id)}`}>{r.name}</Link>
                <b>{bench && r.raw !== null ? formatScore(bench, r.raw) : r.y.toFixed(1)}</b>
                {r.gain !== null && <span className="delta delta-pos">▲ {r.gain.toFixed(1)}</span>}
                <span className="record-held">{r.held === null ? 'current record' : `held ${r.held} days`}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <HiddenTable
        caption={`${metricLabel} by release date`}
        headers={['Model', 'Released', metricLabel]}
        rows={points.map((p) => [p.name, fmtDate(new Date(p.t).toISOString()), p.y.toFixed(1)])}
      />
    </section>
  );
}
