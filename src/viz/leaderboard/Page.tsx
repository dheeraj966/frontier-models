import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataset } from '../../data/DatasetProvider';
import { availableCategories, benchmarksFor, blendedPrice, categoryScores, fmtCtx, fmtPrice } from '../../utils/insights';
import { formatScore, normalizeScore, scoreOf } from '../../utils/scores';
import { fmtDate } from '../../utils/time';
import { bool, list, oneOf, str, useUrlState } from '../../hooks/useUrlState';
import { datasetToCsv, exportCsv, copyText } from '../../utils/export';
import { Medal, Meter, ModelCell, PageHeader, ScoreChip, SearchInput } from '../../components/ui';
import { useToast } from '../../components/Toasts';
import Icon from '../../components/Icon';
import { usePreferences } from '../../state/preferences';
import { JOBS, booksAtOnce, booksText, duration, gradeFor, jobCost, money, skillFor, writeSeconds } from '../../utils/human';
import type { Benchmark } from '../../data/types';

/** Everyday name for a benchmark column in Simple mode. */
const plainName = (b: Benchmark) =>
  skillFor(b.id)?.name ??
  (b.id === 'arena-elo' ? 'People prefer' : b.id === 'aa-intelligence-index' ? 'Independent score' : b.shortName);

type Dir = 'asc' | 'desc';

export default function LeaderboardPage() {
  const { models, benchmarks, lookup, scores, composites } = useDataset();
  const navigate = useNavigate();
  const toast = useToast();
  const cats = useMemo(() => availableCategories(benchmarks), [benchmarks]);
  const [catId, setCatId] = useUrlState('cat', 'overall', str);
  const cat = cats.find((c) => c.id === catId) ?? cats[0];
  const [sortKey, setSortKey] = useUrlState('sort', 'score', str);
  const [dir, setDir] = useUrlState<Dir>('dir', 'desc', oneOf('desc', 'asc'));
  const [expected, setExpected] = useUrlState('expected', true, bool);
  const [hiddenProviders, setHiddenProviders] = useUrlState('hide', [] as string[], list);
  const [dense, setDense] = useUrlState('dense', false, bool);
  const [q, setQ] = useState('');
  const simple = usePreferences().depth === 'simple';

  const cols = useMemo(() => benchmarksFor(benchmarks, cat), [benchmarks, cat]);
  const catScores = useMemo(() => categoryScores(models, benchmarks, lookup, cat), [models, benchmarks, lookup, cat]);
  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))], [models]);
  const live = useMemo(
    () => new Set(scores.filter((s) => s.source !== 'mock').map((s) => `${s.modelId}\0${s.benchmarkId}`)),
    [scores],
  );

  // Rank of each model inside each benchmark column (for gold/silver/bronze chips).
  const colRanks = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const b of cols) {
      const vals = models
        .map((m) => ({ id: m.id, v: scoreOf(lookup, m.id, b.id) }))
        .filter((x) => x.v !== null)
        .map((x) => ({ id: x.id, s: normalizeScore(b, x.v as number) }))
        .sort((a, c) => c.s - a.s);
      out.set(b.id, new Map(vals.map((x, i) => [x.id, i + 1])));
    }
    return out;
  }, [cols, models, lookup]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = models.filter(
      (m) =>
        (expected || m.status !== 'expected') &&
        !hiddenProviders.includes(m.provider) &&
        (!needle || `${m.name} ${m.provider} ${m.family}`.toLowerCase().includes(needle)),
    );
    const val = (id: string): number | null => {
      const m = models.find((x) => x.id === id)!;
      switch (sortKey) {
        case 'score':
          return catScores.get(id) ?? null;
        case 'price':
          return blendedPrice(m);
        case 'speed':
          return m.outputTokensPerSec ?? null;
        case 'ctx':
          return m.contextWindow ?? null;
        case 'released':
          return m.releaseDate ? Date.parse(m.releaseDate) : null;
        default: {
          const b = cols.find((x) => x.id === sortKey);
          const raw = b ? scoreOf(lookup, id, b.id) : null;
          return b && raw !== null ? normalizeScore(b, raw) : null;
        }
      }
    };
    return filtered
      .map((m) => ({ m, v: val(m.id) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return a.m.name.localeCompare(b.m.name);
        if (a.v === null) return 1;
        if (b.v === null) return -1;
        return dir === 'desc' ? b.v - a.v : a.v - b.v;
      })
      .map((r) => r.m);
  }, [models, expected, hiddenProviders, q, sortKey, dir, catScores, cols, lookup]);

  const scoreRank = useMemo(() => {
    const ranked = models.filter((m) => catScores.get(m.id) != null).sort((a, b) => catScores.get(b.id)! - catScores.get(a.id)!);
    return new Map(ranked.map((m, i) => [m.id, i + 1]));
  }, [models, catScores]);

  const sortBy = (key: string) => {
    if (sortKey === key) setDir(dir === 'desc' ? 'asc' : 'desc');
    else {
      setSortKey(key);
      setDir(key === 'price' ? 'asc' : 'desc');
    }
  };
  const th = (key: string, label: React.ReactNode, cls = 'num', title?: string) => (
    <th
      key={key}
      className={`${cls}${sortKey === key ? ' sorted' : ''}`}
      aria-sort={sortKey === key ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
      title={title}
    >
      <button type="button" className="th-btn" onClick={() => sortBy(key)}>
        {label}
        <Icon
          name="chevronDown"
          size={12}
          className={`sort-ic${sortKey === key ? ' on' : ''}${sortKey === key && dir === 'asc' ? ' up' : ''}`}
        />
      </button>
    </th>
  );
  const isRanked = sortKey === 'score' && dir === 'desc';

  return (
    <section>
      <PageHeader
        eyebrow="Rankings"
        title={simple ? 'Who’s best, skill by skill' : 'Who leads, and by how much'}
        description={
          simple
            ? 'Each model gets a report-card grade for every skill, compared with the others here: A+ is the best, D is near the bottom. Switch to Detailed (D) for the raw test scores.'
            : `Ranked by ${cat.id === 'overall' ? 'the weighted composite of all benchmarks' : `${cat.label.toLowerCase()} benchmarks`}. Each benchmark is scaled to its declared range (0–100); gold, silver and bronze mark the top three in every column.`
        }
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={async () =>
                toast.push({ tone: (await copyText(location.href)) ? 'success' : 'error', title: 'Link copied' })
              }
            >
              <Icon name="link" size={14} /> Share view
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                exportCsv(
                  `leaderboard-${cat.id}-${new Date().toISOString().slice(0, 10)}.csv`,
                  datasetToCsv(rows, benchmarks, scores, composites),
                )
              }
            >
              <Icon name="download" size={14} /> CSV
            </button>
          </>
        }
      />

      <div className="cat-tabs big" role="tablist" aria-label="Category">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === cat.id}
            className={`cat-tab${c.id === cat.id ? ' active' : ''}`}
            onClick={() => {
              setCatId(c.id);
              if (!['score', 'price', 'speed', 'ctx', 'released'].includes(sortKey)) setSortKey('score');
            }}
          >
            <Icon name={c.icon} size={14} /> {c.label}
          </button>
        ))}
      </div>

      <div className="toolbar-row">
        <SearchInput value={q} onChange={setQ} placeholder="Filter models or labs…" />
        <div className="chip-row" role="group" aria-label="Labs">
          {providers.map((p) => {
            const on = !hiddenProviders.includes(p);
            const color = models.find((m) => m.provider === p)!.color;
            return (
              <button
                key={p}
                type="button"
                className={`chip ${on ? 'active' : ''}`}
                aria-pressed={on}
                onClick={() => setHiddenProviders(on ? [...hiddenProviders, p] : hiddenProviders.filter((x) => x !== p))}
              >
                <span className="dot" style={{ background: color }} />
                {p}
              </button>
            );
          })}
        </div>
        <div className="toolbar-end">
          <label className="switch">
            <input type="checkbox" checked={expected} onChange={(e) => setExpected(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            Projected
          </label>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDense(!dense)}
            title={dense ? 'Comfortable rows' : 'Compact rows'}
            aria-label="Toggle row density"
          >
            <Icon name="menu" size={15} />
          </button>
        </div>
      </div>

      <div className={`card table-card${dense ? ' dense' : ''}`}>
        <div className="table-wrap" role="region" aria-label="Leaderboard table" tabIndex={0}>
          <table className="data-table lb-table">
            <thead>
              <tr>
                <th className="col-rank sticky-1">#</th>
                <th className="sticky-2">Model</th>
                {th('score', cat.id === 'overall' ? (simple ? 'Overall' : 'Composite') : `${cat.label}`, 'num col-score')}
                {cols.map((b) =>
                  th(
                    b.id,
                    simple ? plainName(b) : b.shortName,
                    `num${simple ? ' col-grade' : ''}`,
                    `${b.name} — ${b.description ?? ''}`,
                  ),
                )}
                {simple
                  ? th('price', 'Book summary costs', 'num', 'What it costs to summarise a 300-page book')
                  : th('price', '$/MTok', 'num', 'Blended price, 3 input : 1 output, USD per million tokens')}
                {simple
                  ? th('speed', '300 words in', 'num', 'Time to write a 300-word answer')
                  : th('speed', 'Speed', 'num', 'Median output tokens per second')}
                {th('ctx', simple ? 'Reads at once' : 'Context', 'num')}
                {th('released', 'Released', 'num')}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const s = catScores.get(m.id) ?? null;
                const rank = isRanked ? i + 1 : scoreRank.get(m.id);
                return (
                  <tr
                    key={m.id}
                    className={`clickable${m.status === 'expected' ? ' is-proj' : ''}`}
                    onClick={() => navigate(`/model/${encodeURIComponent(m.id)}`)}
                  >
                    <td className="col-rank sticky-1">{rank ? <Medal rank={rank} /> : <span className="muted">—</span>}</td>
                    <td className="sticky-2">
                      <ModelCell model={m} sub={m.provider} />
                    </td>
                    <td className="num col-score">
                      <span className="score-with-bar">
                        <b className="mono">{s === null ? '—' : s.toFixed(1)}</b>
                        <Meter value={s} color={m.color} />
                      </span>
                    </td>
                    {cols.map((b) => {
                      const raw = scoreOf(lookup, m.id, b.id);
                      const isLive = live.has(`${m.id}\0${b.id}`);
                      if (simple) {
                        const ranks = colRanks.get(b.id);
                        const g = gradeFor(ranks?.get(m.id), ranks?.size ?? 0);
                        return (
                          <td key={b.id} className="num col-grade">
                            <span
                              className={`grade-chip grade-${g.tone}`}
                              title={raw === null ? `${b.name}: not tested` : `${b.name}: ${formatScore(b, raw)} — ${g.words}`}
                            >
                              {g.letter}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={b.id} className="num">
                          <ScoreChip
                            value={raw}
                            rank={colRanks.get(b.id)?.get(m.id)}
                            live={isLive}
                            title={
                              raw === null
                                ? `${b.name}: not evaluated`
                                : `${b.name}: ${formatScore(b, raw)}${isLive ? ' · live' : ' · mock'}`
                            }
                          >
                            {raw === null ? undefined : b.unit === 'elo' ? Math.round(raw) : raw.toFixed(1)}
                          </ScoreChip>
                        </td>
                      );
                    })}
                    <td className="num mono">
                      {simple ? money(jobCost(m, JOBS[0])) : fmtPrice(blendedPrice(m))}
                      {m.statsSource && m.statsSource !== 'mock' && <span className="live-dot" title="Live" />}
                    </td>
                    <td className="num mono">
                      {simple ? (
                        duration(writeSeconds(m))
                      ) : m.outputTokensPerSec ? (
                        Math.round(m.outputTokensPerSec)
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num mono">{simple ? booksText(booksAtOnce(m)) : fmtCtx(m.contextWindow)}</td>
                    <td className="num muted">{m.releaseDate ? fmtDate(m.releaseDate) : 'Upcoming'}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 7} className="empty-row">
                    No models match. Clear the search or turn labs back on.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {simple ? (
        <p className="footnote">
          {rows.length} of {models.length} models · click a row for its report card · grades compare models with each other, not
          with people · “Independent score” is the Artificial Analysis Intelligence Index.
        </p>
      ) : (
        <p className="footnote">
          {rows.length} of {models.length} models · click a row for details · <span className="live-dot" /> live value · weights:{' '}
          {benchmarks
            .map((b) => `${b.shortName} ${((b.weight / (benchmarks.reduce((a, x) => a + x.weight, 0) || 1)) * 100).toFixed(0)}%`)
            .join(' · ')}
        </p>
      )}
    </section>
  );
}
