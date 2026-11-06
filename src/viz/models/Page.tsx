import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDataset } from '../../data/DatasetProvider';
import { blendedPrice, categoryScores, fmtCtx, fmtPrice, availableCategories } from '../../utils/insights';
import { rankBy } from '../../utils/scores';
import { fmtDate } from '../../utils/time';
import { list, oneOf, useUrlState } from '../../hooks/useUrlState';
import { MiniBars, ModelAvatar, ModelBadges, PageHeader, SearchInput, Segmented } from '../../components/ui';
import { usePreferences } from '../../state/preferences';
import { JOBS, booksAtOnce, booksText, duration, jobCost, money, writeSeconds } from '../../utils/human';

type SortKey = 'score' | 'newest' | 'price' | 'name';

export default function ModelsPage() {
  const { models, benchmarks, lookup, composites } = useDataset();
  const [q, setQ] = useState('');
  const simple = usePreferences().depth === 'simple';
  const [sort, setSort] = useUrlState<SortKey>('sort', 'score', oneOf('score', 'newest', 'price', 'name'));
  const [labs, setLabs] = useUrlState('labs', [] as string[], list);
  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))], [models]);
  const ranks = useMemo(() => rankBy(composites), [composites]);
  const cats = useMemo(
    () =>
      availableCategories(benchmarks)
        .filter((c) => c.id !== 'overall' && c.id !== 'aggregate')
        .slice(0, 7),
    [benchmarks],
  );
  const catMaps = useMemo(
    () => cats.map((c) => categoryScores(models, benchmarks, lookup, c)),
    [cats, models, benchmarks, lookup],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = models.filter(
      (m) =>
        (!labs.length || labs.includes(m.provider)) &&
        (!needle || `${m.name} ${m.provider} ${m.family}`.toLowerCase().includes(needle)),
    );
    const by: Record<SortKey, (a: (typeof models)[number], b: (typeof models)[number]) => number> = {
      score: (a, b) => (composites.get(b.id) ?? -1) - (composites.get(a.id) ?? -1),
      newest: (a, b) => (b.releaseDate ?? '9999').localeCompare(a.releaseDate ?? '9999'),
      price: (a, b) => (blendedPrice(a) ?? 1e9) - (blendedPrice(b) ?? 1e9),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[sort]);
  }, [models, labs, q, sort, composites]);

  return (
    <section>
      <PageHeader
        eyebrow="Directory"
        title="Every model we track"
        description={`${models.length} models from ${providers.length} labs. Bars show each model’s profile across ${cats.map((c) => c.label.toLowerCase()).join(', ')}.`}
      />

      <div className="toolbar-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search models…" />
        <div className="chip-row" role="group" aria-label="Labs">
          {providers.map((p) => {
            const on = labs.includes(p);
            return (
              <button
                key={p}
                type="button"
                className={`chip ${on ? 'active' : ''}`}
                aria-pressed={on}
                onClick={() => setLabs(on ? labs.filter((x) => x !== p) : [...labs, p])}
              >
                <span className="dot" style={{ background: models.find((m) => m.provider === p)!.color }} />
                {p}
              </button>
            );
          })}
        </div>
        <div className="toolbar-end">
          <Segmented<SortKey>
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'score', label: 'Score' },
              { value: 'newest', label: 'Newest' },
              { value: 'price', label: 'Price' },
              { value: 'name', label: 'A–Z' },
            ]}
          />
        </div>
      </div>

      <div className="model-grid">
        {shown.map((m) => {
          const c = composites.get(m.id) ?? null;
          return (
            <Link
              key={m.id}
              to={`/model/${encodeURIComponent(m.id)}`}
              className="model-card"
              style={{ ['--c' as string]: m.color }}
            >
              <div className="model-card-head">
                <ModelAvatar model={m} size={36} />
                <div className="model-card-title">
                  <span className="model-card-name">{m.name}</span>
                  <span className="model-card-sub">
                    {m.provider} · {m.releaseDate ? fmtDate(m.releaseDate) : 'Upcoming'}
                  </span>
                </div>
                <span className="model-card-rank">{ranks.get(m.id) ? `#${ranks.get(m.id)}` : ''}</span>
              </div>
              <div className="model-card-badges">
                <ModelBadges model={m} />
              </div>
              <div className="model-card-score">
                <span className="model-card-big">{c === null ? '—' : c.toFixed(1)}</span>
                <span className="model-card-label">{simple ? 'out of 100 overall' : 'composite'}</span>
                <MiniBars values={catMaps.map((mp) => mp.get(m.id) ?? null)} color={m.color} />
              </div>
              <dl className="model-card-stats">
                {simple ? (
                  <>
                    <div>
                      <dt>Book summary</dt>
                      <dd>{money(jobCost(m, JOBS[0]))}</dd>
                    </div>
                    <div>
                      <dt>Reads at once</dt>
                      <dd>{booksText(booksAtOnce(m))}</dd>
                    </div>
                    <div>
                      <dt>300 words in</dt>
                      <dd>{duration(writeSeconds(m))}</dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <dt>$/MTok</dt>
                      <dd>{fmtPrice(blendedPrice(m))}</dd>
                    </div>
                    <div>
                      <dt>Context</dt>
                      <dd>{fmtCtx(m.contextWindow)}</dd>
                    </div>
                    <div>
                      <dt>Speed</dt>
                      <dd>{m.outputTokensPerSec ? `${Math.round(m.outputTokensPerSec)}/s` : '—'}</dd>
                    </div>
                  </>
                )}
              </dl>
            </Link>
          );
        })}
      </div>
      {shown.length === 0 && <p className="footnote">No models match.</p>}
    </section>
  );
}
