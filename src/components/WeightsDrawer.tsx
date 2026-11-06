import { useMemo } from 'react';
import { useDataset } from '../data/DatasetProvider';
import { usePreferences, type WeightOverrides } from '../state/preferences';
import type { Benchmark, BenchmarkCategory } from '../data/types';
import Modal from './Modal';
import Icon from './Icon';

const PRESETS: { id: string; label: string; boost: Partial<Record<BenchmarkCategory, number>> | 'equal' }[] = [
  { id: 'equal', label: 'Equal', boost: 'equal' },
  { id: 'coding', label: 'Coding', boost: { coding: 3, agentic: 1.5 } },
  { id: 'reasoning', label: 'Reasoning & math', boost: { reasoning: 2.5, math: 2.5, knowledge: 1.5 } },
  { id: 'agentic', label: 'Agents', boost: { agentic: 3, coding: 1.5 } },
  { id: 'people', label: 'Human preference', boost: { 'human-preference': 4, multimodal: 1.5 } },
];

function presetWeights(base: Benchmark[], boost: (typeof PRESETS)[number]['boost']): WeightOverrides {
  const raw = Object.fromEntries(base.map((b) => [b.id, boost === 'equal' ? 1 : b.weight * (boost[b.category] ?? 1)]));
  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((v / sum) * 1000) / 1000]));
}

/** Side sheet with a slider per benchmark; every composite in the app follows it live. */
export default function WeightsDrawer() {
  const { weightsOpen, setWeightsOpen, weights, setWeights } = usePreferences();
  const { baseBenchmarks, benchmarks, composites, models } = useDataset();
  const total = benchmarks.reduce((a, b) => a + Math.max(0, b.weight), 0) || 1;

  const top = useMemo(
    () =>
      models
        .filter((m) => composites.get(m.id) != null)
        .sort((a, b) => composites.get(b.id)! - composites.get(a.id)!)
        .slice(0, 3),
    [models, composites],
  );

  const set = (id: string, v: number) => {
    const cur = weights ?? Object.fromEntries(baseBenchmarks.map((b) => [b.id, b.weight]));
    setWeights({ ...cur, [id]: v });
  };

  return (
    <Modal open={weightsOpen} onClose={() => setWeightsOpen(false)} label="Composite weights" className="sheet">
      <div className="sheet-head">
        <div>
          <h2>Composite weights</h2>
          <p>Every composite, rank and colour in the app updates as you drag. Saved in this browser only.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setWeightsOpen(false)}>
          <Icon name="x" />
        </button>
      </div>

      <div className="preset-row" role="group" aria-label="Presets">
        <button type="button" className={`chip ${weights === null ? 'active' : ''}`} onClick={() => setWeights(null)}>
          Default
        </button>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="chip" onClick={() => setWeights(presetWeights(baseBenchmarks, p.boost))}>
            {p.label}
          </button>
        ))}
      </div>

      <ul className="weight-list">
        {benchmarks.map((b) => {
          const share = (Math.max(0, b.weight) / total) * 100;
          const base = baseBenchmarks.find((x) => x.id === b.id)?.weight ?? 0;
          return (
            <li key={b.id}>
              <label htmlFor={`w-${b.id}`}>
                <span>{b.name}</span>
                <span className="weight-share">
                  {share.toFixed(0)}%{Math.abs(b.weight - base) > 1e-6 && <em> (default {Math.round(base * 100)}%)</em>}
                </span>
              </label>
              <input
                id={`w-${b.id}`}
                type="range"
                min={0}
                max={0.4}
                step={0.01}
                value={Math.min(0.4, b.weight)}
                onChange={(e) => set(b.id, Number(e.target.value))}
                style={{ ['--fill' as string]: `${(Math.min(0.4, b.weight) / 0.4) * 100}%` }}
              />
            </li>
          );
        })}
      </ul>

      <div className="sheet-foot">
        <div className="sheet-top">
          <span className="controls-label">Top 3 now</span>
          {top.map((m, i) => (
            <span key={m.id} className="top-pill">
              <b>{i + 1}</b>
              <span className="dot" style={{ background: m.color }} />
              {m.shortName} <em>{composites.get(m.id)!.toFixed(1)}</em>
            </span>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => setWeights(null)} disabled={weights === null}>
          Reset to defaults
        </button>
      </div>
    </Modal>
  );
}
