import { useMemo } from 'react';
import ModelLink from '../../components/ModelLink';
import { oneOf, useUrlState } from '../../hooks/useUrlState';
import { useDataset } from '../../data/DatasetProvider';
import { buildScoreLookup, scoreOf, normalizeScore, compositeScore, formatScore, unitLabel } from '../../utils/scores';
import { heatColor, heatGradient, heatTextColor } from '../../utils/color';

type ColorMode = 'relative' | 'absolute';

export default function HeatmapPage() {
  const { models, benchmarks, scores: allScores } = useDataset();
  const [mode, setMode] = useUrlState<ColorMode>('color', 'relative', oneOf('relative', 'absolute'));
  const liveSet = useMemo(
    () => new Set(allScores.filter((s) => s.source !== 'mock').map((s) => `${s.modelId}\0${s.benchmarkId}`)),
    [allScores],
  );
  const lookup = useMemo(() => buildScoreLookup(allScores), [allScores]);

  const rows = useMemo(
    () =>
      models
        .map((m) => ({ model: m, composite: compositeScore(benchmarks, lookup, m.id) }))
        .sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1)),
    [models, benchmarks, lookup],
  );

  // Per-column min/max of the scaled score (and of composite) for "relative" colouring.
  const ranges = useMemo(() => {
    const map = new Map<string, [number, number]>();
    const push = (k: string, v: number) => {
      const r = map.get(k);
      map.set(k, r ? [Math.min(r[0], v), Math.max(r[1], v)] : [v, v]);
    };
    for (const m of models) {
      for (const b of benchmarks) {
        const raw = scoreOf(lookup, m.id, b.id);
        if (raw !== null) push(b.id, normalizeScore(b, raw));
      }
      const c = compositeScore(benchmarks, lookup, m.id);
      if (c !== null) push('__composite', c);
    }
    return map;
  }, [models, benchmarks, lookup]);

  const tFor = (key: string, scaled: number) => {
    if (mode === 'absolute') return scaled / 100;
    const r = ranges.get(key);
    if (!r || r[1] === r[0]) return 0.5;
    return (scaled - r[0]) / (r[1] - r[0]);
  };

  const cellStyle = (t: number) => ({ background: heatColor(t), color: heatTextColor(t) });

  return (
    <section>
      <div className="page-head">
        <p className="eyebrow">Heatmap</p>
        <h1>Score Heatmap</h1>
        <p className="page-sub">
          Raw scores in every cell. Rows sorted by composite (best first).{' '}
          {mode === 'relative'
            ? 'Colour = position within each column (worst → best of the models shown), so small gaps between frontier models stay visible.'
            : 'Colour = score scaled to each benchmark’s declared range (0–100).'}
        </p>
      </div>

      <div className="toolbar">
        <div className="controls" role="group" aria-label="Colour scale">
          <span className="controls-label">Colour</span>
          <div className="segmented">
            <button type="button" aria-pressed={mode === 'relative'} onClick={() => setMode('relative')}>
              Relative per column
            </button>
            <button type="button" aria-pressed={mode === 'absolute'} onClick={() => setMode('absolute')}>
              Absolute 0–100
            </button>
          </div>
        </div>
      </div>

      <div className="panel table-scroll" role="region" aria-label="Scrollable scores heatmap" tabIndex={0}>
        <table className="heat-table" aria-label="Raw scores per model and benchmark, shaded by scaled score">
          <caption className="visually-hidden">Raw benchmark scores for every model; cell color encodes the scaled score</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky-col">
                Model
              </th>
              {benchmarks.map((b) => (
                <th key={b.id} scope="col" title={`${b.name} (${unitLabel(b)}) · weight ${b.weight}`}>
                  {b.shortName}
                </th>
              ))}
              <th scope="col" title="Weighted mean of scaled scores">
                Composite
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ model, composite }) => (
              <tr key={model.id} className={model.status === 'expected' ? 'row-expected' : undefined}>
                <th scope="row" className="rowhead sticky-col">
                  <span className="dot" style={{ background: model.color }} />
                  <span className="rowhead-name">
                    <ModelLink model={model}>{model.shortName}</ModelLink>
                    {model.status === 'expected' && <span className="badge badge-expected">PROJ</span>}
                    {model.baseline && <span className="badge badge-baseline">BASE</span>}
                  </span>
                </th>
                {benchmarks.map((b) => {
                  const raw = scoreOf(lookup, model.id, b.id);
                  if (raw === null) {
                    return (
                      <td key={b.id} className="heat-cell heat-empty" title={`${model.name} — ${b.name}: not evaluated`}>
                        <span className="heat-chip">—</span>
                      </td>
                    );
                  }
                  const normalized = normalizeScore(b, raw);
                  return (
                    <td
                      key={b.id}
                      className={`heat-cell${liveSet.has(`${model.id}\0${b.id}`) ? ' is-live' : ''}`}
                      title={`${model.name} — ${b.name}: ${formatScore(b, raw)} (scaled ${normalized.toFixed(1)}/100)${liveSet.has(`${model.id}\0${b.id}`) ? ' · live' : ' · mock'}`}
                    >
                      <span className="heat-chip" style={cellStyle(tFor(b.id, normalized))}>
                        {b.unit === 'elo' ? Math.round(raw) : raw.toFixed(1)}
                      </span>
                    </td>
                  );
                })}
                <td
                  className="heat-cell heat-composite"
                  title={
                    composite === null
                      ? `${model.name}: no usable scores`
                      : `${model.name} — composite ${composite.toFixed(1)}/100`
                  }
                >
                  <span className="heat-chip" style={composite === null ? undefined : cellStyle(tFor('__composite', composite))}>
                    {composite === null ? '—' : composite.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="heat-legend">
        <span>{mode === 'relative' ? 'lowest in column' : '0'}</span>
        <div className="heat-legend-bar" style={{ background: heatGradient() }} />
        <span>{mode === 'relative' ? 'highest in column' : '100'}</span>
      </div>
      <p className="footnote">
        Composite = weighted mean of scaled scores; weights from benchmark definitions, renormalized over available data. PROJ =
        expected/projected (mock) · BASE = baseline (previous generation). Striped cell = not evaluated.
      </p>
    </section>
  );
}
