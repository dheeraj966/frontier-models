import { useMemo, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { TooltipProps } from 'recharts';
import { useDataset } from '../../data/DatasetProvider';
import type { Benchmark, Model } from '../../data/types';
import { buildScoreLookup, scoreOf, normalizeScore, formatScore, unitLabel } from '../../utils/scores';
import HiddenTable from '../../components/HiddenTable';
import { useChartTheme, focusOpacity } from '../theme';
import { list, str, useUrlState } from '../../hooks/useUrlState';
import ChartActions from '../../components/ChartActions';

const hatchId = (id: string) => `hatch-${id.replace(/[^a-z0-9-]/gi, '_')}`;

/** Diagonal hatch fills for projected models — clearer than a dashed outline on thin bars. */
// Called as a function (not <HatchDefs/>): Recharts only renders raw <defs> children.
function hatchDefs(models: Model[]) {
  return (
    <defs>
      {models
        .filter((m) => m.status === 'expected')
        .map((m) => (
          <pattern key={m.id} id={hatchId(m.id)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={m.color} fillOpacity={0.28} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={m.color} strokeWidth="3" />
          </pattern>
        ))}
    </defs>
  );
}

const NORMALIZED = 'normalized';

interface NormalizedTooltipProps extends TooltipProps<number, string> {
  lookup: Map<string, number | null>;
  benchmarks: Benchmark[];
  models: Model[];
}

function NormalizedTooltip({ active, payload, lookup, benchmarks, models }: NormalizedTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload as { benchmarkId?: string; fullName?: string } | undefined;
  const bench = benchmarks.find((b) => b.id === row?.benchmarkId);
  const entries = [...payload].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">
        {row?.fullName ?? ''}
        {bench ? ' (scaled 0–100)' : ''}
      </p>
      {entries.map((entry) => {
        const modelId = entry.dataKey as string;
        const raw = bench ? scoreOf(lookup, modelId, bench.id) : null;
        const model = models.find((m) => m.id === modelId);
        return (
          <div key={modelId} className="chart-tooltip-row">
            <span className="chart-tooltip-name">
              <span className="dot" style={{ background: model?.color }} />
              {entry.name}
              {model?.status === 'expected' ? ' (proj)' : ''}
            </span>
            <span className="chart-tooltip-value">
              {entry.value == null ? '—' : Number(entry.value).toFixed(1)}
              {raw != null && bench && <span className="chart-tooltip-raw"> · raw {formatScore(bench, raw)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface RawTooltipProps extends TooltipProps<number, string> {
  bench: Benchmark;
}

function RawTooltip({ active, payload, bench }: RawTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0];
  const point = entry?.payload as
    { name: string; status?: Model['status']; value: number | null; normalized: number } | undefined;
  if (!point) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">
        {point.name}
        {point.status === 'expected' ? ' (projected)' : ''}
      </p>
      <div className="chart-tooltip-row">
        <span>{bench.name}</span>
        <span className="chart-tooltip-value">{point.value === null ? '—' : formatScore(bench, point.value)}</span>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-raw">Normalized</span>
        <span className="chart-tooltip-value">{point.normalized.toFixed(1)} / 100</span>
      </div>
    </div>
  );
}

const benchmarkDomain = (b: Benchmark): [number, number] => [b.min, b.max];

export default function BarsPage() {
  const { models, benchmarks, scores } = useDataset();
  const chartTheme = useChartTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useUrlState('b', NORMALIZED, str);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useUrlState('hide', [] as string[], list);
  const visibleModels = useMemo(() => models.filter((m) => !hidden.includes(m.id)), [models, hidden]);
  const toggleHidden = (id: string) =>
    setHidden((prev: string[]) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const activeBenchmark = benchmarks.find((b) => b.id === view) ?? null;

  const lookup = useMemo(() => buildScoreLookup(scores), [scores]);

  const normalizedRows = useMemo(
    () =>
      benchmarks.map((b) => {
        const row: Record<string, string | number | null> = {
          benchmarkId: b.id,
          name: b.shortName,
          fullName: b.name,
        };
        for (const m of models) {
          const raw = scoreOf(lookup, m.id, b.id);
          row[m.id] = raw === null ? null : Math.round(normalizeScore(b, raw) * 10) / 10;
        }
        return row;
      }),
    [benchmarks, models, lookup],
  );

  const singleRows = useMemo(() => {
    if (!activeBenchmark) return [];
    return models
      .map((m) => {
        const raw = scoreOf(lookup, m.id, activeBenchmark.id);
        return {
          id: m.id,
          name: m.shortName,
          value: raw,
          normalized: raw === null ? 0 : normalizeScore(activeBenchmark, raw),
          color: m.color,
          status: m.status,
          baseline: m.baseline,
        };
      })
      .sort((a, b) => b.normalized - a.normalized);
  }, [activeBenchmark, models, lookup]);

  const shownRows = useMemo(() => singleRows.filter((r) => r.value !== null), [singleRows]);
  const missingRows = useMemo(() => singleRows.filter((r) => r.value === null), [singleRows]);
  const average = useMemo(
    () => (shownRows.length ? shownRows.reduce((acc, r) => acc + (r.value ?? 0), 0) / shownRows.length : null),
    [shownRows],
  );

  const hiddenHeaders = activeBenchmark
    ? ['Model', `${activeBenchmark.name} (${unitLabel(activeBenchmark)})`, 'Scaled (0–100)']
    : ['Benchmark', ...visibleModels.map((m) => m.shortName)];
  const hiddenRows = activeBenchmark
    ? shownRows.map((r) => [`${r.name}${r.status === 'expected' ? ' (proj)' : ''}`, r.value ?? null, r.normalized.toFixed(1)])
    : normalizedRows.map((r) => [r.fullName as string, ...visibleModels.map((m) => (r[m.id] === null ? null : String(r[m.id])))]);

  return (
    <section>
      <div className="page-head">
        <p className="eyebrow">Bars</p>
        <h1>Benchmark Comparison</h1>
        <p className="page-sub">
          {activeBenchmark
            ? `Raw scores (${unitLabel(activeBenchmark)}) — ${activeBenchmark.name}. Sorted best → worst.`
            : 'All benchmarks scaled to each benchmark’s declared range (0–100) so mixed units stay comparable. Raw values are in the tooltip.'}
        </p>
      </div>

      <div className="toolbar">
        <div className="controls" role="group" aria-label="Benchmark filter">
          <span className="controls-label">View</span>
          <button
            type="button"
            className={`chip ${view === NORMALIZED ? 'active' : ''}`}
            aria-pressed={view === NORMALIZED}
            onClick={() => setView(NORMALIZED)}
          >
            All (scaled)
          </button>
          {benchmarks.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`chip ${view === b.id ? 'active' : ''}`}
              aria-pressed={view === b.id}
              title={b.name}
              onClick={() => setView(b.id)}
            >
              {b.shortName}
            </button>
          ))}
        </div>
        {!activeBenchmark && (
          <div className="controls" role="group" aria-label="Show or hide models">
            <span className="controls-label">Models</span>
            {models.map((m) => {
              const on = !hidden.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`chip model-chip ${on ? 'active' : ''}`}
                  aria-pressed={on}
                  onClick={() => toggleHidden(m.id)}
                  onMouseEnter={() => on && setHovered(m.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => on && setHovered(m.id)}
                  onBlur={() => setHovered(null)}
                  title={`${on ? 'Hide' : 'Show'} ${m.name}`}
                >
                  <span className="dot" style={{ background: m.color }} />
                  {m.shortName}
                  {m.status === 'expected' && <span className="chip-tag">proj</span>}
                  {m.baseline && <span className="chip-tag chip-tag-base">base</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel chart-panel" ref={chartRef}>
        <div className="panel-head">
          <h2 className="panel-title">{activeBenchmark ? activeBenchmark.name : 'All benchmarks, scaled'}</h2>
          <ChartActions target={chartRef} name="bars" />
        </div>
        {activeBenchmark && shownRows.length === 0 ? (
          <p className="placeholder">No evaluated scores for {activeBenchmark.name}.</p>
        ) : !activeBenchmark && normalizedRows.every((r) => models.every((m) => r[m.id] === null)) ? (
          <p className="placeholder">No evaluated scores available.</p>
        ) : !activeBenchmark && visibleModels.length === 0 ? (
          <p className="placeholder">All models are hidden — toggle some models above.</p>
        ) : (
          <div className="chart-scroll">
            <div className="chart-min">
              <ResponsiveContainer key={view} width="100%" height={activeBenchmark ? 440 : 500}>
                {activeBenchmark ? (
                  <BarChart data={shownRows} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                    {hatchDefs(models)}
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      height={64}
                      stroke={chartTheme.axis}
                      tickLine={false}
                      tick={{ fill: chartTheme.tick, fontSize: 11 }}
                      tickMargin={8}
                    />
                    <YAxis
                      domain={benchmarkDomain(activeBenchmark)}
                      stroke={chartTheme.axis}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tick={{ fill: chartTheme.tickMuted, fontSize: chartTheme.font }}
                      label={{
                        value: unitLabel(activeBenchmark),
                        angle: -90,
                        position: 'insideLeft',
                        fill: chartTheme.tickMuted,
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      content={<RawTooltip bench={activeBenchmark} />}
                      cursor={{ fill: chartTheme.cursorFill }}
                      wrapperStyle={{ zIndex: 10 }}
                    />
                    {average !== null && (
                      <ReferenceLine
                        y={average}
                        stroke={chartTheme.tickMuted}
                        strokeDasharray="5 4"
                        label={{
                          value: `avg ${formatScore(activeBenchmark, average)}`,
                          position: 'insideTopRight',
                          fill: chartTheme.tick,
                          fontSize: 11,
                        }}
                      />
                    )}
                    <Bar
                      dataKey="value"
                      name={activeBenchmark.shortName}
                      isAnimationActive={false}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={56}
                    >
                      {shownRows.map((r) => (
                        <Cell
                          key={r.id}
                          fill={r.status === 'expected' ? `url(#${hatchId(r.id)})` : r.color}
                          fillOpacity={r.baseline ? 0.55 : 0.92}
                          stroke={r.status === 'expected' ? r.color : 'none'}
                          strokeWidth={r.status === 'expected' ? 1.5 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart
                    data={normalizedRows}
                    margin={{ top: 16, right: 12, left: 4, bottom: 4 }}
                    barCategoryGap="16%"
                    barGap={2}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {hatchDefs(visibleModels)}
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      stroke={chartTheme.axis}
                      tickLine={false}
                      tick={{ fill: chartTheme.tick, fontSize: chartTheme.font, fontWeight: 500 }}
                      tickMargin={10}
                    />
                    <YAxis
                      domain={[0, 100]}
                      stroke={chartTheme.axis}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={{ fill: chartTheme.tickMuted, fontSize: chartTheme.font }}
                      label={{
                        value: 'Scaled (0–100)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: chartTheme.tickMuted,
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      content={<NormalizedTooltip lookup={lookup} benchmarks={benchmarks} models={models} />}
                      filterNull={false}
                      cursor={{ fill: chartTheme.cursorFill }}
                      wrapperStyle={{ zIndex: 10 }}
                    />
                    {visibleModels.map((m) => (
                      <Bar
                        key={m.id}
                        dataKey={m.id}
                        name={m.shortName}
                        fill={m.status === 'expected' ? `url(#${hatchId(m.id)})` : m.color}
                        fillOpacity={focusOpacity(m.id, hovered, m.baseline ? 0.55 : 0.92)}
                        stroke={m.status === 'expected' ? m.color : 'none'}
                        strokeOpacity={hovered === null || hovered === m.id ? 1 : 0.2}
                        strokeWidth={m.status === 'expected' ? 1.25 : 0}
                        isAnimationActive={false}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={18}
                        onMouseEnter={() => setHovered(m.id)}
                      />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeBenchmark && missingRows.length > 0 && (
          <p className="footnote">Not evaluated: {missingRows.map((r) => r.name).join(', ')}</p>
        )}
        <div className="legend-row">
          <span>
            <i className="swatch-hatch" /> expected / projected
          </span>
          <span>
            <i className="swatch-faint" /> baseline (previous gen)
          </span>
          {!activeBenchmark && <span>Hover a model chip to isolate it · click to hide</span>}
        </div>
        {activeBenchmark?.unit === 'elo' && (
          <p className="footnote">
            Y-axis starts at the Elo floor (1,000), not zero — bar lengths are not proportional to absolute value; compare via the
            tooltip.
          </p>
        )}
      </div>

      <HiddenTable
        caption={`Benchmark scores ${activeBenchmark ? `for ${activeBenchmark.name}` : 'scaled to each declared range (0–100)'}`}
        headers={hiddenHeaders}
        rows={hiddenRows}
      />
    </section>
  );
}
