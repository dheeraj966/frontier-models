import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDataset } from '../data/DatasetProvider';
import type { Benchmark, Model, ScorePoint } from '../data/types';
import { formatScore, median, normalizeScore, rankBy, scoreOf, coverage } from '../utils/scores';
import { fmtDate } from '../utils/time';
import { useChartTheme } from '../viz/theme';
import { useHotkeys } from '../hooks/useHotkeys';
import { usePreferences } from '../state/preferences';
import Icon from '../components/Icon';
import HiddenTable from '../components/HiddenTable';
import { ModelAvatar } from '../components/ui';
import { blendedPrice } from '../utils/insights';
import {
  JOBS,
  SKILLS,
  booksAtOnce,
  booksText,
  duration,
  gradeFor,
  jobCost,
  money as everydayMoney,
  summarize,
  winChance,
  writeSeconds,
} from '../utils/human';

/** Plain-English report card: grades instead of raw scores, everyday units instead of tokens. */
function ReportCard({
  model,
  models,
  benchmarks,
  lookup,
  rank,
  total,
}: {
  model: Model;
  models: Model[];
  benchmarks: Benchmark[];
  lookup: Map<string, number | null>;
  rank?: number;
  total: number;
}) {
  const grades = SKILLS.flatMap((skill) => {
    const b = benchmarks.find((x) => x.id === skill.id);
    if (!b) return [];
    const field = models
      .map((m) => ({ id: m.id, v: scoreOf(lookup, m.id, b.id) }))
      .filter((x): x is { id: string; v: number } => x.v !== null)
      .sort((a, c) => normalizeScore(b, c.v) - normalizeScore(b, a.v));
    const mine = scoreOf(lookup, model.id, b.id);
    const r = field.findIndex((x) => x.id === model.id) + 1 || undefined;
    const g = gradeFor(r, field.length);
    const others = field.map((x) => ({ id: x.id, v: normalizeScore(b, x.v) }));
    return [
      {
        skill,
        letter: g.letter,
        tone: g.tone,
        words: g.words,
        scaled: mine === null ? null : normalizeScore(b, mine),
        others,
        rank: r,
      },
    ];
  });
  const overall = gradeFor(rank, total);
  const arena = benchmarks.find((b) => b.id === 'arena-elo');
  const myElo = arena ? scoreOf(lookup, model.id, arena.id) : null;
  const elos = arena ? models.map((m) => scoreOf(lookup, m.id, arena.id)).filter((v): v is number => v !== null) : [];
  const avgElo = elos.length ? elos.reduce((a, b) => a + b, 0) / elos.length : null;
  const prices = models
    .map(blendedPrice)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const myPrice = blendedPrice(model);
  const cheap = myPrice != null && prices.length && myPrice <= prices[Math.floor(prices.length / 3)];
  const pricey = myPrice != null && prices.length && myPrice >= prices[Math.floor((prices.length * 2) / 3)];
  const good = grades.filter((g) => g.tone === 'a').map((g) => g.skill.name);
  const weak = grades.filter((g) => g.tone === 'd' || g.tone === 'c').map((g) => g.skill.name);

  return (
    <>
      <div className="report" style={{ ['--model' as string]: model.color }}>
        <div>
          <p className="eyebrow">
            <ModelAvatar model={model} size={20} /> {model.provider} ·{' '}
            {model.releaseDate ? `released ${fmtDate(model.releaseDate)}` : 'not released yet'}
          </p>
          <h1 className="report-name">
            {model.name}
            {model.status === 'expected' && <span className="badge badge-proj">PROJECTED</span>}
            {model.baseline && <span className="badge badge-base">PREVIOUS GEN</span>}
          </h1>
          <p className="report-summary">{summarize(model, grades, rank, total)}</p>
        </div>
        <div className="report-grade" aria-label={`Overall grade ${overall.letter}`}>
          <span className={`grade-letter grade-${overall.tone}`}>{overall.letter}</span>
          <b>Overall</b>
          <small>{rank ? `#${rank} of ${total} · ${overall.words}` : 'not enough tests yet'}</small>
        </div>
      </div>

      <section className="panel standings" aria-label="Skill by skill" style={{ ['--model' as string]: model.color }}>
        <header className="standings-head">
          <h2>Skill by skill</h2>
          <p>
            Each line is the whole field for one skill — every dot is a model. <i className="st-key" /> is {model.shortName}.
          </p>
        </header>
        <ol className="standings-list">
          {grades.map((g) => {
            const vs = g.others.map((o) => o.v);
            const lo = Math.min(...vs);
            const hi = Math.max(...vs);
            const x = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
            return (
              <li key={g.skill.id} className="standing" title={g.skill.plain}>
                <span className={`skill-grade grade-${g.tone}`}>{g.letter}</span>
                <div className="standing-text">
                  <b>
                    <Icon name={g.skill.icon} size={13} /> {g.skill.name}
                  </b>
                  <p>
                    {g.scaled === null
                      ? 'Not tested yet'
                      : `${Math.round(g.scaled)} of 100 ${g.skill.unit} — ${g.words}${g.rank ? ` (#${g.rank} of ${g.others.length})` : ''}`}
                  </p>
                </div>
                <div className="strip" aria-hidden="true">
                  <span className="strip-line" />
                  {g.others.map((o) => (
                    <span
                      key={o.id}
                      className={`strip-dot${o.id === model.id ? ' me' : ''}`}
                      style={{ left: `${x(o.v)}%`, ...(o.id === model.id ? { background: model.color } : {}) }}
                    >
                      {o.id === model.id && <em>{Math.round(o.v)}</em>}
                    </span>
                  ))}
                  <span className="strip-end lo">weakest here</span>
                  <span className="strip-end hi">best here</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="everyday">
        <div className="everyday-card">
          <span>
            <Icon name="book" size={13} /> Summarise a book
          </span>
          <b>{everydayMoney(jobCost(model, JOBS[0]))}</b>
          <small>300 pages in, 1 page out</small>
        </div>
        <div className="everyday-card">
          <span>
            <Icon name="gauge" size={13} /> Write 300 words
          </span>
          <b>{duration(writeSeconds(model))}</b>
          <small>a person needs ~7½ min</small>
        </div>
        <div className="everyday-card">
          <span>
            <Icon name="layers" size={13} /> Reads at once
          </span>
          <b>{booksText(booksAtOnce(model))}</b>
          <small>of 300 pages each</small>
        </div>
        <div className="everyday-card">
          <span>
            <Icon name="user" size={13} /> People prefer it
          </span>
          <b>{myElo != null && avgElo != null ? `${Math.round(winChance(myElo, avgElo) * 100)}%` : '—'}</b>
          <small>of the time vs an average model</small>
        </div>
      </div>

      <div className="goodfor">
        <div>
          <h3>
            <Icon name="check" size={15} /> Good choice for
          </h3>
          <ul>
            {good.slice(0, 4).map((x) => (
              <li key={x}>{x}</li>
            ))}
            {cheap && <li>High-volume work on a budget</li>}
            {!good.length && !cheap && <li>General use — it has no standout skill here</li>}
          </ul>
        </div>
        <div>
          <h3>
            <Icon name="info" size={15} /> Think twice for
          </h3>
          <ul>
            {weak.slice(0, 4).map((x) => (
              <li key={x}>{x}</li>
            ))}
            {pricey && <li>Large volumes — it is one of the pricier options</li>}
            {model.status === 'expected' && <li>Anything today — it isn’t released yet</li>}
            {!weak.length && !pricey && model.status !== 'expected' && <li>Nothing obvious from these tests</li>}
          </ul>
        </div>
      </div>
    </>
  );
}

const money = (v?: number) => (v == null ? '—' : `$${v < 1 ? v.toFixed(2) : v.toFixed(v % 1 ? 2 : 0)}`);
const ctxFmt = (v?: number) =>
  v == null ? '—' : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M` : `${Math.round(v / 1000)}k`;

export default function ModelPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { models, benchmarks, lookup, composites, scores, getHistory } = useDataset();
  const { paletteOpen, weightsOpen, helpOpen, depth } = usePreferences();
  const [showNumbers, setShowNumbers] = useState(false);
  const ct = useChartTheme();
  const model = models.find((m) => m.id === id);

  const ranks = useMemo(() => rankBy(composites), [composites]);
  const ordered = useMemo(
    () => [...models].sort((a, b) => (composites.get(b.id) ?? -1) - (composites.get(a.id) ?? -1)),
    [models, composites],
  );
  const idx = ordered.findIndex((m) => m.id === id);
  const prev = idx > 0 ? ordered[idx - 1] : undefined;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : undefined;

  const composite = composites.get(id) ?? null;
  const baseline = model ? models.find((m) => m.baseline && m.family === model.family && m.id !== model.id) : undefined;
  const baseComp = baseline ? (composites.get(baseline.id) ?? null) : null;
  const delta = composite !== null && baseComp !== null && !model?.baseline ? composite - baseComp : null;

  const rows = useMemo(() => {
    if (!model) return [];
    return benchmarks.map((b) => {
      const raw = scoreOf(lookup, model.id, b.id);
      const field = models
        .map((m) => ({ id: m.id, v: scoreOf(lookup, m.id, b.id) }))
        .filter((x): x is { id: string; v: number } => x.v !== null)
        .map((x) => ({ id: x.id, s: normalizeScore(b, x.v) }))
        .sort((a, c) => c.s - a.s);
      const rank = field.findIndex((x) => x.id === model.id) + 1;
      const src = scores.find((s) => s.modelId === model.id && s.benchmarkId === b.id);
      return {
        b,
        raw,
        scaled: raw === null ? null : normalizeScore(b, raw),
        rank: rank || null,
        of: field.length,
        med: median(field.map((x) => x.s)),
        best: field[0]?.s ?? null,
        live: src ? src.source !== 'mock' : false,
        asOf: src?.asOf,
      };
    });
  }, [model, benchmarks, models, lookup, scores]);

  const radarData = rows.map((r) => ({
    axis: r.b.shortName,
    model: r.scaled === null ? null : Math.round(r.scaled * 10) / 10,
    field: r.med === null ? null : Math.round(r.med * 10) / 10,
  }));

  const rivals = useMemo(() => {
    if (composite === null) return [];
    return models
      .filter((m) => m.id !== id && composites.get(m.id) != null)
      .map((m) => ({ m, d: (composites.get(m.id) as number) - composite }))
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))
      .slice(0, 3);
  }, [models, composites, composite, id]);

  const [history, setHistory] = useState<ScorePoint[] | null>(null);
  useEffect(() => {
    setHistory(null);
    if (!getHistory || !model) return;
    let alive = true;
    getHistory(model.id)
      .then((h) => alive && setHistory(h))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [getHistory, model]);

  const series = useMemo(() => {
    if (!history) return [];
    const byB = new Map<string, ScorePoint[]>();
    for (const p of history) {
      if (p.value === null || p.source === 'mock') continue;
      byB.set(p.benchmarkId, [...(byB.get(p.benchmarkId) ?? []), p]);
    }
    return [...byB.entries()]
      .filter(([, pts]) => new Set(pts.map((p) => p.asOf)).size >= 2)
      .map(([bid, pts]) => ({ b: benchmarks.find((x) => x.id === bid)!, pts: pts.sort((a, c) => a.asOf.localeCompare(c.asOf)) }))
      .filter((x) => x.b);
  }, [history, benchmarks]);

  const blocked = paletteOpen || weightsOpen || helpOpen;
  useHotkeys(
    {
      ArrowLeft: () => prev && navigate(`/model/${encodeURIComponent(prev.id)}`),
      ArrowRight: () => next && navigate(`/model/${encodeURIComponent(next.id)}`),
      c: () => model && navigate(`/compare?m=${[model.id, rivals[0]?.m.id].filter(Boolean).join(',')}`),
    },
    !blocked,
  );

  if (!model) {
    return (
      <section className="empty-state">
        <p className="eyebrow">Model</p>
        <h1>Model not found</h1>
        <p className="page-sub">
          No model with id <code>{id}</code>. <Link to="/leaderboard">Back to the leaderboard</Link>.
        </p>
      </section>
    );
  }

  const rank = ranks.get(model.id);
  const cov = coverage(benchmarks, lookup, model.id);
  const statLive = model.statsSource && model.statsSource !== 'mock';

  return (
    <section>
      <div className="model-nav">
        <Link to="/leaderboard" className="crumb">
          <Icon name="leaderboard" size={14} /> Rankings
        </Link>
        <div className="model-nav-arrows">
          <button
            type="button"
            className="icon-btn"
            disabled={!prev}
            onClick={() => prev && navigate(`/model/${encodeURIComponent(prev.id)}`)}
            title={prev ? `Previous: ${prev.name} (←)` : undefined}
            aria-label="Previous model"
          >
            <Icon name="arrowLeft" />
          </button>
          <span className="model-nav-pos">
            {idx + 1} / {ordered.length}
          </span>
          <button
            type="button"
            className="icon-btn"
            disabled={!next}
            onClick={() => next && navigate(`/model/${encodeURIComponent(next.id)}`)}
            title={next ? `Next: ${next.name} (→)` : undefined}
            aria-label="Next model"
          >
            <Icon name="arrowRight" />
          </button>
        </div>
      </div>

      {depth === 'simple' && (
        <>
          <ReportCard model={model} models={models} benchmarks={benchmarks} lookup={lookup} rank={rank} total={ranks.size} />
          <div className="details-toggle">
            <button type="button" className="btn" onClick={() => setShowNumbers(!showNumbers)} aria-expanded={showNumbers}>
              <Icon name={showNumbers ? 'chevronDown' : 'layers'} size={14} />{' '}
              {showNumbers ? 'Hide the numbers' : 'Show all the numbers'}
            </button>
          </div>
        </>
      )}
      {(depth === 'detailed' || showNumbers) && (
        <>
          {depth === 'detailed' && (
            <div className="panel model-hero" style={{ ['--model' as string]: model.color }}>
              <div className="model-hero-main">
                <p className="eyebrow">
                  {model.provider} · {model.family}
                </p>
                <h1>
                  {model.name}
                  {model.status === 'expected' && <span className="badge badge-expected">PROJECTED</span>}
                  {model.baseline && <span className="badge badge-baseline">BASELINE</span>}
                  {model.origin === 'import' && <span className="badge badge-live">IMPORTED</span>}
                </h1>
                {model.notes && <p className="page-sub">{model.notes}</p>}
                <div className="hero-cta">
                  {rivals[0] && (
                    <Link className="btn btn-primary" to={`/compare?m=${model.id},${rivals[0].m.id}`}>
                      <Icon name="compare" size={14} /> Compare with {rivals[0].m.shortName}
                    </Link>
                  )}
                  {baseline && (
                    <Link className="btn" to={`/compare?m=${model.id},${baseline.id}`}>
                      vs {baseline.shortName} (previous gen)
                    </Link>
                  )}
                </div>
              </div>
              <div className="model-score">
                <span className="model-score-label">Composite</span>
                <span className="model-score-value">{composite === null ? '—' : composite.toFixed(1)}</span>
                <span className="model-score-sub">
                  {rank ? (
                    <>
                      Rank <b>#{rank}</b> of {ranks.size}
                    </>
                  ) : (
                    `Only ${Math.round(cov * 100)}% of weight evaluated`
                  )}
                  {delta !== null && (
                    <span className={`delta ${delta >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} vs {baseline?.shortName}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="kpi-grid">
            {[
              ['Released', model.releaseDate ? fmtDate(model.releaseDate) : model.status === 'expected' ? 'Not yet' : '—', false],
              ['Context window', `${ctxFmt(model.contextWindow)} tokens`, false],
              ['Input price', `${money(model.costPerMTokIn)} / MTok`, statLive],
              ['Output price', `${money(model.costPerMTokOut)} / MTok`, statLive],
              [
                'Output speed',
                model.outputTokensPerSec == null ? '—' : `${Math.round(model.outputTokensPerSec)} tok/s`,
                statLive,
              ],
              ['First token', model.ttftSeconds == null ? '—' : `${model.ttftSeconds.toFixed(2)} s`, statLive],
            ].map(([k, v, live]) => (
              <div key={String(k)} className="kpi">
                <span className="kpi-label">
                  {k}
                  {live ? <span className="live-mark" title={`Live · ${model.statsAsOf ?? ''}`} /> : null}
                </span>
                <span className="kpi-value">{v}</span>
              </div>
            ))}
          </div>

          <div className="viz-split model-split">
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Benchmark breakdown</h2>
                <span className="panel-hint">
                  bar = scaled score · <i className="tick-med" /> field median · <i className="tick-best" /> best
                </span>
              </div>
              <ul className="bench-list">
                {rows.map((r) => (
                  <li key={r.b.id}>
                    <div className="bench-row-head">
                      <span className="bench-name" title={r.b.name}>
                        {r.b.name}
                        {r.live && <span className="live-mark" title={`Live · ${r.asOf}`} />}
                      </span>
                      <span className="bench-raw">{r.raw === null ? 'not evaluated' : formatScore(r.b, r.raw)}</span>
                      <span className={`bench-rank ${r.rank === 1 ? 'is-top' : ''}`}>{r.rank ? `#${r.rank}/${r.of}` : '—'}</span>
                    </div>
                    <div className="bench-track">
                      {r.scaled !== null && (
                        <span className="bench-fill" style={{ width: `${r.scaled}%`, background: model.color }} />
                      )}
                      {r.med !== null && <span className="bench-tick tick-med" style={{ left: `${r.med}%` }} />}
                      {r.best !== null && <span className="bench-tick tick-best" style={{ left: `${r.best}%` }} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="side-col">
              <div className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Shape vs field median</h2>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} outerRadius="70%">
                    <PolarGrid stroke={ct.grid} />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: ct.tick, fontSize: 10 }} />
                    <PolarRadiusAxis domain={[40, 100]} allowDataOverflow tick={false} axisLine={false} />
                    <Radar
                      dataKey="field"
                      name="Field median"
                      stroke={ct.tickMuted}
                      fill={ct.tickMuted}
                      fillOpacity={0.08}
                      strokeDasharray="4 3"
                      isAnimationActive={false}
                    />
                    <Radar
                      dataKey="model"
                      name={model.shortName}
                      stroke={model.color}
                      fill={model.color}
                      fillOpacity={0.25}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Closest rivals</h2>
                </div>
                {rivals.length === 0 ? (
                  <p className="placeholder">No composite to compare.</p>
                ) : (
                  <ul className="rival-list">
                    {rivals.map(({ m, d }) => (
                      <li key={m.id}>
                        <span className="dot" style={{ background: m.color }} />
                        <Link to={`/model/${encodeURIComponent(m.id)}`}>{m.name}</Link>
                        <span
                          className="delta delta-neutral"
                          title={
                            d >= 0
                              ? `${m.shortName} scores ${d.toFixed(1)} higher`
                              : `${m.shortName} scores ${Math.abs(d).toFixed(1)} lower`
                          }
                        >
                          {Math.abs(d) < 0.05 ? 'tied' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`}
                        </span>
                        <Link
                          className="icon-btn"
                          to={`/compare?m=${model.id},${m.id}`}
                          title={`Compare ${model.shortName} with ${m.shortName}`}
                          aria-label="Compare"
                        >
                          <Icon name="compare" size={14} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">History</h2>
              <span className="panel-hint">Live values recorded at each refresh</span>
            </div>
            {!getHistory ? (
              <p className="placeholder">No history available.</p>
            ) : history === null ? (
              <p className="placeholder">Loading history…</p>
            ) : series.length === 0 ? (
              <p className="placeholder">No history yet — it builds up as live refreshes run (daily by default).</p>
            ) : (
              <div className="spark-grid">
                {series.map(({ b, pts }) => (
                  <div key={b.id} className="spark">
                    <div className="spark-head">
                      <span>{b.shortName}</span>
                      <b>{formatScore(b, pts[pts.length - 1].value as number)}</b>
                    </div>
                    <ResponsiveContainer width="100%" height={60}>
                      <LineChart data={pts.map((p) => ({ t: p.asOf, v: p.value }))}>
                        <XAxis dataKey="t" hide />
                        <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border-strong)',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Line dataKey="v" stroke={model.color} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <HiddenTable
        caption={`${model.name} benchmark scores`}
        headers={['Benchmark', 'Raw', 'Scaled (0–100)', 'Rank']}
        rows={rows.map((r) => [
          r.b.name,
          r.raw === null ? null : formatScore(r.b, r.raw),
          r.scaled === null ? null : r.scaled.toFixed(1),
          r.rank ? `${r.rank} of ${r.of}` : null,
        ])}
      />
    </section>
  );
}
