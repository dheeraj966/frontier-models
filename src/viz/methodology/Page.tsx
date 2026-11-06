import { useDataset } from '../../data/DatasetProvider';
import { CATEGORIES } from '../../utils/insights';
import { usePreferences } from '../../state/preferences';
import { Card, PageHeader } from '../../components/ui';
import Icon from '../../components/Icon';
import { MIN_COVERAGE } from '../../utils/scores';

export default function MethodologyPage() {
  const { benchmarks, baseBenchmarks, customWeights } = useDataset();
  const { setWeightsOpen } = usePreferences();
  const total = benchmarks.reduce((a, b) => a + Math.max(0, b.weight), 0) || 1;
  const catLabel = (c: string) => CATEGORIES.find((x) => x.cats !== 'all' && x.cats.includes(c as never))?.label ?? c;

  return (
    <section className="prose-page">
      <PageHeader
        eyebrow="Methodology"
        title="How the numbers are made"
        description="Different benchmarks use different units — percentages, Elo ratings, index points. Everything here is put on one 0–100 scale first, then combined with explicit, adjustable weights."
        actions={
          <button type="button" className="btn" onClick={() => setWeightsOpen(true)}>
            <Icon name="sliders" size={14} /> Adjust weights
          </button>
        }
      />

      <div className="grid-3 method-steps">
        <Card title="1 · Scale" marker="#8b7cf6">
          <p>Each raw score is placed within its benchmark’s declared range and clamped:</p>
          <pre className="formula">scaled = 100 × (raw − min) ÷ (max − min)</pre>
          <p className="muted">e.g. an Elo of 1,480 on a 1,000–1,600 range → 80.0. Lower-is-better benchmarks are flipped.</p>
        </Card>
        <Card title="2 · Weight" marker="#34d399">
          <p>The composite is a weighted mean of scaled scores:</p>
          <pre className="formula">composite = Σ wᵢ·scaledᵢ ÷ Σ wᵢ</pre>
          <p className="muted">
            Weights only count benchmarks a model was actually evaluated on, so a missing score is skipped rather than treated as
            zero.
          </p>
        </Card>
        <Card title="3 · Guard" marker="#f59e0b">
          <p>
            A composite is only shown when the evaluated benchmarks carry at least <b>{Math.round(MIN_COVERAGE * 100)}%</b> of the
            total weight.
          </p>
          <p className="muted">
            That stops a model with a single great score from topping the board. Category scores use only that category’s
            benchmarks.
          </p>
        </Card>
      </div>

      <Card
        title="Benchmarks and weights"
        marker="#60a5fa"
        subtitle={customWeights ? 'Showing your custom weights (defaults in grey)' : 'Default weights from data/benchmarks.csv'}
      >
        <div className="table-wrap">
          <table className="data-table bench-table">
            <thead>
              <tr>
                <th>Benchmark</th>
                <th>Category</th>
                <th className="num">Range</th>
                <th>Weight</th>
                <th className="hide-md">What it measures</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map((b) => {
                const share = (Math.max(0, b.weight) / total) * 100;
                const base = baseBenchmarks.find((x) => x.id === b.id);
                return (
                  <tr key={b.id}>
                    <td>
                      <b>{b.name}</b>
                    </td>
                    <td>
                      <span className="tag">{catLabel(b.category)}</span>
                    </td>
                    <td className="num mono muted">
                      {b.min}–{b.max}
                      {b.unit === '%' ? '%' : b.unit === 'elo' ? ' Elo' : ''}
                    </td>
                    <td className="weight-cell">
                      <span className="weight-bar">
                        <span style={{ width: `${share * 2.5}%` }} />
                      </span>
                      <span className="mono">{share.toFixed(0)}%</span>
                      {customWeights && base && <span className="muted mono"> ({Math.round(base.weight * 100)}%)</span>}
                    </td>
                    <td className="hide-md muted">{b.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Where the data comes from" marker="#22d3ee">
          <ul className="bullets">
            <li>
              <b>Live values</b> come from the{' '}
              <a href="https://artificialanalysis.ai/" target="_blank" rel="noreferrer">
                Artificial Analysis
              </a>{' '}
              Data API: their Intelligence Index, prices, output speed, latency and release dates (plus GPQA Diamond and MMMU-Pro
              with a Pro key). They are credited wherever shown.
            </li>
            <li>
              <b>Placeholder values</b> fill every other cell until a source covers it. They are labelled “mock” in{' '}
              <code>data/scores.csv</code> and never override a live number.
            </li>
            <li>Every refresh is dated, so the history of each value is kept and each change is logged.</li>
          </ul>
        </Card>
        <Card title="Reading the charts" marker="#f472b6">
          <ul className="bullets">
            <li>
              <span className="score-chip gold">90.1</span> <span className="score-chip silver">89.4</span>{' '}
              <span className="score-chip bronze">88.6</span> — first, second and third in that column.
            </li>
            <li>
              <span className="live-dot" /> marks a live value; everything else is a placeholder.
            </li>
            <li>
              <span className="badge badge-proj">PROJ</span> projected (announced, unreleased) ·{' '}
              <span className="badge badge-base">BASE</span> previous generation · <span className="badge badge-new">NEW</span>{' '}
              released in the last 45 days.
            </li>
            <li>Price is a 3:1 blend of input and output price per million tokens — the common way to quote one number.</li>
          </ul>
        </Card>
      </div>
    </section>
  );
}
