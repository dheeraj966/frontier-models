import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipProps } from 'recharts';
import { useDataset } from '../../data/DatasetProvider';
import type { Benchmark, Model } from '../../data/types';
import { buildScoreLookup, scoreOf, normalizeScore, compositeScore, formatScore } from '../../utils/scores';
import HiddenTable from '../../components/HiddenTable';
import { useChartTheme, focusOpacity } from '../theme';
import { list, oneOf, useUrlState } from '../../hooks/useUrlState';
import ChartActions from '../../components/ChartActions';

const SCALE = oneOf('focus', 'full');

interface RadarTooltipProps extends TooltipProps<number, string> {
  benchmarks: Benchmark[];
  lookup: Map<string, number | null>;
  models: Model[];
}

function RadarTooltip({ active, payload, benchmarks, lookup, models }: RadarTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload as { benchmarkId?: string } | undefined;
  const bench = benchmarks.find((b) => b.id === row?.benchmarkId);
  if (!bench) return null;
  const entries = [...payload].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{bench.name}</p>
      {entries.map((entry) => {
        const modelId = entry.dataKey as string;
        const model = models.find((m) => m.id === modelId);
        const raw = scoreOf(lookup, modelId, bench.id);
        const suffix = model?.status === 'expected' ? ' (proj)' : model?.baseline ? ' (base)' : '';
        return (
          <div key={modelId} className="chart-tooltip-row">
            <span className="chart-tooltip-name">
              <span className="dot" style={{ background: model?.color ?? entry.color }} />
              {entry.name}
              {suffix}
            </span>
            <span className="chart-tooltip-value">
              {entry.value == null ? '—' : Number(entry.value).toFixed(1)}
              {raw != null && <span className="chart-tooltip-raw"> · raw {formatScore(bench, raw)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function RadarPage() {
  const { models, benchmarks, scores } = useDataset();
  const lookup = useMemo(() => buildScoreLookup(scores), [scores]);

  const comps = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const m of models) map.set(m.id, compositeScore(benchmarks, lookup, m.id));
    return map;
  }, [models, benchmarks, lookup]);

  const topReleased = useMemo(
    () =>
      [...models]
        .filter((m) => m.status === 'released')
        .sort((a, b) => (comps.get(b.id) ?? -1) - (comps.get(a.id) ?? -1))
        .map((m) => m.id)
        .slice(0, 4),
    [models, comps],
  );

  const chartTheme = useChartTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useUrlState('m', topReleased, list);
  const [scale, setScale] = useUrlState('scale', 'focus', SCALE);
  const focusScale = scale === 'focus';
  const setFocusScale = (v: boolean) => setScale(v ? 'focus' : 'full');
  const [hovered, setHovered] = useState<string | null>(null);

  const toggleModel = (id: string) =>
    setSelected((prev: string[]) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectedModels = useMemo(() => models.filter((m) => selected.includes(m.id)), [models, selected]);

  const chartData = useMemo(
    () =>
      benchmarks.map((b) => {
        const row: Record<string, string | number | null> = { benchmarkId: b.id, axis: b.shortName };
        for (const m of selectedModels) {
          const raw = scoreOf(lookup, m.id, b.id);
          row[m.id] = raw === null ? null : Math.round(normalizeScore(b, raw) * 10) / 10;
        }
        return row;
      }),
    [benchmarks, selectedModels, lookup],
  );

  // "Focus" zooms the radial axis to the populated band so near-identical
  // frontier models stop collapsing into one blob. Floor sits below the lowest
  // plotted value, so no point is ever pushed past the centre.
  const radialDomain = useMemo<[number, number]>(() => {
    if (!focusScale) return [0, 100];
    let lo = 100;
    for (const row of chartData)
      for (const m of selectedModels) {
        const v = row[m.id];
        if (typeof v === 'number') lo = Math.min(lo, v);
      }
    const floor = Math.max(0, Math.floor((lo - 5) / 10) * 10);
    return [Math.min(floor, 80), 100];
  }, [focusScale, chartData, selectedModels]);

  const missingNotes = useMemo(() => {
    const notes: string[] = [];
    for (const m of selectedModels) {
      for (const b of benchmarks) {
        if (scoreOf(lookup, m.id, b.id) === null) notes.push(`${m.shortName} — ${b.shortName}`);
      }
    }
    return notes;
  }, [selectedModels, benchmarks, lookup]);

  const rankedSelection = useMemo(
    () => [...selectedModels].sort((a, b) => (comps.get(b.id) ?? -1) - (comps.get(a.id) ?? -1)),
    [selectedModels, comps],
  );

  const hiddenHeaders = ['Benchmark', ...selectedModels.map((m) => m.shortName)];
  const hiddenRows = chartData.map((r) => [
    String(r.axis),
    ...selectedModels.map((m) => (r[m.id] === null ? null : String(r[m.id]))),
  ]);

  return (
    <section>
      <div className="page-head">
        <p className="eyebrow">Radar</p>
        <h1>Benchmark Shape</h1>
        <p className="page-sub">
          Each axis is scaled to the benchmark’s declared range (0–100). Higher on more axes = stronger all-around model — compare
          axis heights, not area.
        </p>
      </div>

      <div className="toolbar">
        <div className="controls" role="group" aria-label="Radial scale">
          <span className="controls-label">Scale</span>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={focusScale}
              onClick={() => setFocusScale(true)}
              title="Zoom the radial axis to where the scores are"
            >
              Focus
            </button>
            <button type="button" aria-pressed={!focusScale} onClick={() => setFocusScale(false)} title="Full 0–100 radial axis">
              Full 0–100
            </button>
          </div>
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
                onMouseEnter={() => active && setHovered(m.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => active && setHovered(m.id)}
                onBlur={() => setHovered(null)}
                title={`${m.name}${m.status !== 'released' ? ' (projected)' : ''}`}
              >
                <span className="dot" style={{ background: m.color }} />
                {m.shortName}
                {m.status === 'expected' && <span className="chip-tag">proj</span>}
                {m.baseline && <span className="chip-tag chip-tag-base">base</span>}
              </button>
            );
          })}
          <button type="button" className="chip ghost" onClick={() => setSelected(topReleased)}>
            Reset
          </button>
        </div>
      </div>

      <div className="viz-split">
        <div className="panel chart-panel" ref={chartRef} onMouseLeave={() => setHovered(null)}>
          <div className="panel-head">
            <h2 className="panel-title">Scaled score by benchmark</h2>
            <span className="panel-hint">
              Radial axis {radialDomain[0]}–{radialDomain[1]}
              {focusScale ? ' (focused)' : ''}
            </span>
            <ChartActions target={chartRef} name="radar" />
          </div>
          {selectedModels.length === 0 ? (
            <p className="placeholder">Select at least one model above to draw the radar.</p>
          ) : (
            <ResponsiveContainer width="100%" aspect={1.45} minHeight={300} maxHeight={520}>
              <RadarChart data={chartData} outerRadius="80%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke={chartTheme.grid} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: chartTheme.tick, fontSize: chartTheme.font, fontWeight: 500 }} />
                <PolarRadiusAxis
                  domain={radialDomain}
                  allowDataOverflow
                  tickCount={radialDomain[0] === 0 ? 3 : 4}
                  tick={{ fill: chartTheme.tickMuted, fontSize: 10 }}
                  axisLine={false}
                  angle={90 - 180 / Math.max(benchmarks.length, 1)}
                />
                <Tooltip
                  content={<RadarTooltip benchmarks={benchmarks} lookup={lookup} models={models} />}
                  filterNull={false}
                  wrapperStyle={{ zIndex: 10 }}
                />
                {selectedModels.map((m) => (
                  <Radar
                    key={m.id}
                    name={m.shortName}
                    dataKey={m.id}
                    stroke={m.color}
                    fill={m.color}
                    fillOpacity={focusOpacity(m.id, hovered, m.baseline ? 0.06 : 0.16)}
                    strokeOpacity={hovered === null || hovered === m.id ? 1 : 0.25}
                    strokeWidth={hovered === m.id ? 3.5 : m.status === 'expected' ? 1.5 : 2.25}
                    strokeDasharray={m.status === 'expected' ? '5 4' : '0'}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          )}
          <div className="legend-row">
            <span>
              <i className="swatch-dashed" /> expected / projected
            </span>
            <span>
              <i className="swatch-faint" /> baseline (previous gen)
            </span>
            <span>Hover a model to isolate it</span>
          </div>
          {missingNotes.length > 0 && (
            <p className="footnote">Not evaluated (polygon breaks at these axes): {missingNotes.join(', ')}</p>
          )}
        </div>

        <aside className="panel side-panel" aria-label="Composite ranking of selection">
          <h2 className="side-title">Composite</h2>
          <p className="side-sub">
            Weighted mean of scaled scores, sorted best → worst. Weights renormalize over available data.
          </p>
          {rankedSelection.length === 0 && <p className="placeholder">Nothing selected.</p>}
          <ol className="side-list" onMouseLeave={() => setHovered(null)}>
            {rankedSelection.map((m, i) => {
              const c = comps.get(m.id) ?? null;
              const cls = hovered === m.id ? ' is-hot' : hovered ? ' is-dim' : '';
              return (
                <li key={m.id} className={`side-item${cls}`} onMouseEnter={() => setHovered(m.id)}>
                  <div className="side-item-head">
                    <span className="side-rank">{i + 1}</span>
                    <span className="dot" style={{ background: m.color }} />
                    <Link className="side-item-name model-link" to={`/model/${encodeURIComponent(m.id)}`}>
                      {m.shortName}
                    </Link>
                    <span className="side-item-score">{c === null ? '—' : c.toFixed(1)}</span>
                  </div>
                  <div className="mini-bar">
                    <span className="mini-bar-fill" style={{ width: `${c ?? 0}%`, background: m.color }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      <HiddenTable
        caption="Benchmark shape: scaled scores (0–100) per axis, selected models"
        headers={hiddenHeaders}
        rows={hiddenRows}
      />
    </section>
  );
}
