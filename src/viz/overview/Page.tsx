import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataset } from '../../data/DatasetProvider';
import type { Model } from '../../data/types';
import { usePreferences } from '../../state/preferences';
import { availableCategories, blendedPrice, categoryScores } from '../../utils/insights';
import { normalizeScore, scoreOf } from '../../utils/scores';
import { fmtDate, timeAgo, toDay } from '../../utils/time';
import {
  BOOK_TOKENS,
  JOBS,
  SKILLS,
  booksAtOnce,
  booksText,
  duration,
  humanSeconds,
  jobCost,
  money,
  valueIndex,
  writeSeconds,
} from '../../utils/human';
import Skyline, { type SkylineItem } from '../../components/Skyline';
import { BookStacks, FrontierSteps, IconArray, TypingRace } from '../../components/story';
import { ModelAvatar, ModelBadges } from '../../components/ui';
import HiddenTable from '../../components/HiddenTable';
import Icon from '../../components/Icon';

interface Question {
  id: string;
  ask: string;
  icon: string;
  /** Higher = taller tower. null = not available for that model. */
  metric(m: Model): number | null;
  display(m: Model, v: number): string;
  verdict(ranked: { m: Model; v: number }[]): ReactNode;
  lowerIsBetter?: boolean;
}

function Chapter({
  n,
  kicker,
  title,
  lede,
  children,
  id,
}: {
  n: number;
  kicker: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
  id: string;
}) {
  return (
    <section className="chapter" id={id} aria-labelledby={`${id}-title`}>
      <div className="chapter-head">
        <span className="chapter-num" aria-hidden="true">
          {String(n).padStart(2, '0')}
        </span>
        <div>
          <p className="chapter-kicker">{kicker}</p>
          <h2 className="chapter-title" id={`${id}-title`}>
            {title}
          </h2>
          <p className="chapter-lede">{lede}</p>
        </div>
      </div>
      <div className="chapter-body">{children}</div>
    </section>
  );
}

export default function OverviewPage() {
  const { models, benchmarks, lookup, composites, changes, runs } = useDataset();
  const navigate = useNavigate();
  const { depth } = usePreferences();
  const detailed = depth === 'detailed';
  const cats = useMemo(() => availableCategories(benchmarks), [benchmarks]);
  const catScore = useMemo(() => {
    const get = (id: string) => {
      const c = cats.find((x) => x.id === id);
      return c ? categoryScores(models, benchmarks, lookup, c) : new Map<string, number | null>();
    };
    return { coding: get('coding'), math: get('math') };
  }, [cats, models, benchmarks, lookup]);
  const released = useMemo(() => models.filter((m) => m.status === 'released'), [models]);
  const byComposite = useMemo(
    () => models.filter((m) => composites.get(m.id) != null).sort((a, b) => composites.get(b.id)! - composites.get(a.id)!),
    [models, composites],
  );

  /* ── Questions that drive the skyline ─────────────────────────────── */
  const swe = benchmarks.find((b) => b.id === 'swe-bench-verified');
  const aime = benchmarks.find((b) => b.id === 'aime-2025');
  const book = JOBS[0];
  const allQuestions: Question[] = [
    {
      id: 'smartest',
      ask: 'Which is smartest overall?',
      icon: 'trophy',
      metric: (m) => composites.get(m.id) ?? null,
      display: (_m, v) => `${v.toFixed(1)} / 100`,
      verdict: (r) => {
        const [a, b] = r;
        const bestReleased = r.find((x) => x.m.status === 'released');
        return (
          <>
            <b>{a.m.name}</b> scores highest overall{a.m.status === 'expected' ? ' — but it isn’t released yet' : ''}.{' '}
            {b && (
              <>
                It is {a.v - b.v < 1.5 ? 'only just' : 'clearly'} ahead of <b>{b.m.name}</b> ({a.v.toFixed(1)} vs {b.v.toFixed(1)}{' '}
                out of 100).{' '}
              </>
            )}
            {a.m.status === 'expected' && bestReleased && (
              <>
                The best one you can use today is <b>{bestReleased.m.name}</b>.
              </>
            )}
          </>
        );
      },
    },
    {
      id: 'coding',
      ask: 'Best for writing code?',
      icon: 'code',
      metric: (m) => catScore.coding.get(m.id) ?? null,
      display: (_m, v) => `${v.toFixed(1)} coding score`,
      verdict: (r) => {
        const raw = swe ? scoreOf(lookup, r[0].m.id, swe.id) : null;
        return (
          <>
            For programming, <b>{r[0].m.name}</b> comes out on top.{' '}
            {raw != null && (
              <>
                Given 100 real bugs from open-source projects, it fixes about <b>{Math.round(raw)}</b> of them on its own.{' '}
              </>
            )}
            {r[1] && (
              <>
                <b>{r[1].m.name}</b> is a close second.
              </>
            )}
          </>
        );
      },
    },
    {
      id: 'math',
      ask: 'Best at hard math?',
      icon: 'sigma',
      metric: (m) => catScore.math.get(m.id) ?? null,
      display: (_m, v) => `${v.toFixed(1)} / 100 solved`,
      verdict: (r) => {
        const raw = aime ? scoreOf(lookup, r[0].m.id, aime.id) : null;
        return (
          <>
            <b>{r[0].m.name}</b> is the strongest at math
            {raw != null ? (
              <>
                {' '}
                — it solves about <b>{Math.round(raw)} of 100</b> problems from a national olympiad qualifier that stumps most
                strong students
              </>
            ) : (
              ''
            )}
            .
          </>
        );
      },
    },
    {
      id: 'value',
      ask: 'Best for the money?',
      icon: 'dollar',
      metric: (m) => (m.status === 'released' ? valueIndex(m, composites.get(m.id) ?? null) : null),
      display: (m) => `${money(jobCost(m, book))} per book`,
      verdict: (r) => {
        const top = byComposite.find((m) => m.status === 'released');
        const best = r[0].m;
        const c = composites.get(best.id);
        const tc = top ? composites.get(top.id) : null;
        const pb = blendedPrice(best);
        const pt = top ? blendedPrice(top) : null;
        return (
          <>
            <b>{best.name}</b> gives you the most for your money
            {c != null && tc != null && pb && pt && top && top.id !== best.id ? (
              <>
                : about <b>{Math.round((c / tc) * 100)}%</b> of {top.shortName}’s score for roughly{' '}
                <b>1/{Math.max(2, Math.round(pt / pb))}</b> of the price.
              </>
            ) : (
              '.'
            )}
          </>
        );
      },
    },
    {
      id: 'fastest',
      ask: 'Which answers fastest?',
      icon: 'gauge',
      metric: (m) => m.outputTokensPerSec ?? null,
      display: (m) => `${duration(writeSeconds(m))} for 300 words`,
      verdict: (r) => (
        <>
          <b>{r[0].m.name}</b> is the quickest writer: a 300-word answer in about <b>{duration(writeSeconds(r[0].m))}</b>. Typing
          it yourself would take around {duration(humanSeconds())}.
        </>
      ),
    },
    {
      id: 'memory',
      ask: 'Which can read the most at once?',
      icon: 'book',
      metric: (m) => m.contextWindow ?? null,
      display: (m) => `${booksText(booksAtOnce(m))} at once`,
      verdict: (r) => (
        <>
          <b>{r[0].m.name}</b> can hold the most in mind at once — roughly <b>{booksText(booksAtOnce(r[0].m))}</b> of 300 pages.
          The smallest here manage {booksText(booksAtOnce(r[r.length - 1].m))}.
        </>
      ),
    },
  ];
  const questions = allQuestions.filter((x) => models.filter((m) => x.metric(m) != null).length >= 3);

  const [qid, setQid] = useState('smartest');
  const q = questions.find((x) => x.id === qid) ?? questions[0];
  const [focus, setFocus] = useState<string | null>(null);

  const ranked = useMemo(
    () =>
      models
        .map((m) => ({ m, v: q.metric(m) }))
        .filter((x): x is { m: Model; v: number } => x.v != null)
        .sort((a, b) => b.v - a.v),
    [models, q],
  );
  const items: SkylineItem[] = useMemo(() => {
    const vals = ranked.map((r) => r.v);
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    // Exaggerate differences so they are visible, but never invert or hide the order.
    const floor = q.id === 'smartest' || q.id === 'coding' || q.id === 'math' ? lo - (hi - lo) * 0.7 : 0;
    const norm = (v: number) =>
      q.id === 'memory' ? Math.log(v / (lo * 0.6)) / Math.log(hi / (lo * 0.6)) : (v - floor) / (hi - floor || 1);
    return ranked.map(({ m, v }) => ({
      id: m.id,
      name: m.name,
      short: m.shortName,
      color: m.color,
      value: Math.max(0.04, norm(v)),
      display: q.display(m, v),
      dim: m.status === 'expected',
    }));
  }, [ranked, q]);

  /* ── Chapter 1: skills as "out of 100" ────────────────────────────── */
  const skills = SKILLS.filter((s) => benchmarks.some((b) => b.id === s.id));
  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const skill = skills.find((s) => s.id === skillId) ?? skills[0];
  const skillBench = benchmarks.find((b) => b.id === skill?.id);
  const skillRows = useMemo(() => {
    if (!skillBench) return [];
    return models
      .map((m) => ({ m, raw: scoreOf(lookup, m.id, skillBench.id) }))
      .filter((r): r is { m: Model; raw: number } => r.raw != null)
      .sort((a, b) => b.raw - a.raw);
  }, [models, lookup, skillBench]);
  const [skillModel, setSkillModel] = useState<string | null>(null);
  const shownSkill = skillRows.find((r) => r.m.id === skillModel) ?? skillRows[0];
  const avg = skillRows.length ? skillRows.reduce((a, r) => a + normalizeScore(skillBench!, r.raw), 0) / skillRows.length : null;

  /* ── Chapter 5: frontier record ───────────────────────────────────── */
  const steps = useMemo(() => {
    const pts = released
      .filter((m) => m.releaseDate && composites.get(m.id) != null)
      .map((m) => ({ m, t: toDay(m.releaseDate!), y: composites.get(m.id)! }))
      .sort((a, b) => a.t - b.t);
    const out: { t: number; y: number; label: string; color: string }[] = [];
    let best = -Infinity;
    for (const p of pts)
      if (p.y > best) {
        out.push({ t: p.t, y: p.y, label: p.m.shortName, color: p.m.color });
        best = p.y;
      }
    return out;
  }, [released, composites]);
  const gain = steps.length >= 2 ? steps[steps.length - 1].y - steps[0].y : 0;
  const months = steps.length >= 2 ? Math.max(1, Math.round((steps[steps.length - 1].t - steps[0].t) / (30.4 * 86_400_000))) : 0;
  const lastRun = runs.find((r) => r.status === 'ok');

  return (
    <article className="story">
      {/* ── Hero: ask a question, the city rearranges ─────────────────── */}
      <header className="stage">
        <div className="stage-glow" aria-hidden="true" />
        <div className="stage-copy">
          <p className="eyebrow">
            <span className="pulse" aria-hidden="true" /> {models.length} AI models · updated{' '}
            {lastRun ? timeAgo(lastRun.finishedAt) : fmtDate(new Date().toISOString())}
          </p>
          <h1 className="display stage-title">
            Which AI is best <em>right now?</em>
          </h1>
          <p className="lede">
            Pick a question. The city of models rearranges itself — the taller the building, the better the answer.
          </p>

          <div className="questions" role="tablist" aria-label="Questions">
            {questions.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={x.id === q.id}
                className={`question${x.id === q.id ? ' active' : ''}`}
                onClick={() => {
                  setQid(x.id);
                  setFocus(null);
                }}
              >
                <Icon name={x.icon} size={15} />
                {x.ask}
              </button>
            ))}
          </div>

          <div className="verdict" aria-live="polite">
            <span className="verdict-label">
              <Icon name="sparkles" size={13} /> The short answer
            </span>
            <p>{q.verdict(ranked)}</p>
          </div>

          <ol className="podium-list" onMouseLeave={() => setFocus(null)}>
            {ranked.slice(0, 5).map(({ m, v }, i) => (
              <li key={m.id} className={focus === m.id ? 'is-focus' : ''} onMouseEnter={() => setFocus(m.id)}>
                <Link to={`/model/${encodeURIComponent(m.id)}`} onFocus={() => setFocus(m.id)} onBlur={() => setFocus(null)}>
                  <span className="podium-rank">{i + 1}</span>
                  <ModelAvatar model={m} size={24} />
                  <span className="podium-name">
                    <span className="ellipsis">{m.name}</span> <ModelBadges model={m} />
                  </span>
                  <span className="podium-val">{q.display(m, v)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <div className="stage-scene">
          <Skyline
            items={items}
            focus={focus}
            onFocus={setFocus}
            onOpen={(id) => navigate(`/model/${encodeURIComponent(id)}`)}
            label={`${q.ask} — towers ranked by height`}
          />
          <p className="scene-note">
            <Icon name="info" size={12} /> Taller = better.{' '}
            {q.id === 'smartest' || q.id === 'coding' || q.id === 'math'
              ? 'Heights stretch small gaps so you can see them; the numbers are exact.'
              : ''}{' '}
            Faded towers aren’t released yet.
          </p>
        </div>
      </header>

      {/* ── 1 · What "smart" means ─────────────────────────────────────── */}
      {skill && skillBench && shownSkill && (
        <Chapter
          n={1}
          id="skills"
          kicker="Understanding the scores"
          title="What does “smart” actually mean?"
          lede="Every score here comes from a test. Pick one to see what it measures, as dots out of 100."
        >
          <div className="skill-tabs" role="tablist" aria-label="Skill">
            {skills.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === skill.id}
                className={`skill-tab${s.id === skill.id ? ' active' : ''}`}
                onClick={() => {
                  setSkillId(s.id);
                  setSkillModel(null);
                }}
              >
                <Icon name={s.icon} size={14} /> {s.name}
              </button>
            ))}
          </div>
          <div className="skill-panel">
            <div className="skill-visual">
              <IconArray
                value={normalizeScore(skillBench, shownSkill.raw)}
                compare={avg}
                color={shownSkill.m.color}
                label={`${shownSkill.m.name}: ${Math.round(normalizeScore(skillBench, shownSkill.raw))} out of 100`}
              />
              <div className="ia-legend">
                <span>
                  <i className="ia-key on" style={{ background: shownSkill.m.color }} /> {shownSkill.m.shortName}
                </span>
                {avg != null && (
                  <span>
                    <i className="ia-key ref" /> average model ({Math.round(avg)})
                  </span>
                )}
              </div>
            </div>
            <div className="skill-copy">
              <p className="skill-big">
                <span style={{ color: shownSkill.m.color }}>{Math.round(normalizeScore(skillBench, shownSkill.raw))}</span>
                <small> out of 100</small>
              </p>
              <p className="skill-sentence">
                <b>{shownSkill.m.name}</b> — {skill.unit}.
              </p>
              <p className="skill-plain">{skill.plain}</p>
              {skill.id === 'gpqa-diamond' && (
                <p className="skill-note">
                  For scale: in the original study, PhD experts answering outside their own field scored far lower, and experts
                  inside it got roughly two in three right.
                </p>
              )}
              {detailed && (
                <p className="skill-note mono">
                  {skillBench.name} · raw {shownSkill.raw}
                  {skillBench.unit === '%' ? '%' : ''} · weight {(skillBench.weight * 100).toFixed(0)}%
                </p>
              )}
              <div className="mini-chips" role="group" aria-label="Model">
                {skillRows.slice(0, 8).map((r) => (
                  <button
                    key={r.m.id}
                    type="button"
                    className={`mini-chip${r.m.id === shownSkill.m.id ? ' active' : ''}`}
                    onClick={() => setSkillModel(r.m.id)}
                  >
                    <span className="dot" style={{ background: r.m.color }} />
                    {r.m.shortName}
                    <span className="mono">{Math.round(normalizeScore(skillBench, r.raw))}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Chapter>
      )}

      {/* ── 2 · Speed ──────────────────────────────────────────────────── */}
      <Chapter
        n={2}
        id="speed"
        kicker="Speed"
        title="How fast do they write?"
        lede="Same question, same 300-word answer. Press start and watch them type — against a person at a keyboard."
      >
        <div className="paper-card">
          <TypingRace models={released} />
        </div>
      </Chapter>

      {/* ── 3 · Cost ───────────────────────────────────────────────────── */}
      <Chapter
        n={3}
        id="cost"
        kicker="Price"
        title="What does it cost in real life?"
        lede="Prices are quoted per million “tokens”, which means little to most people. Here is what three everyday jobs would cost."
      >
        <div className="receipts">
          {JOBS.map((job) => {
            const rows = released
              .map((m) => ({ m, c: jobCost(m, job) }))
              .filter((r): r is { m: Model; c: number } => r.c != null)
              .sort((a, b) => a.c - b.c);
            if (!rows.length) return null;
            const max = rows[rows.length - 1].c;
            return (
              <div key={job.id} className="receipt">
                <div className="receipt-head">
                  <span className="receipt-icon">
                    <Icon name={job.icon} size={16} />
                  </span>
                  <div>
                    <h3>{job.title}</h3>
                    <p>{job.detail}</p>
                  </div>
                </div>
                <p className="receipt-range">
                  {money(rows[0].c)} <span>to</span> {money(max)}
                </p>
                <ul className="receipt-lines">
                  {rows.map(({ m, c }, i) => (
                    <li key={m.id} className={i === 0 ? 'cheapest' : ''}>
                      <span className="rl-name">
                        <ModelAvatar model={m} size={16} />
                        {m.shortName}
                      </span>
                      <span className="rl-dots" aria-hidden="true" />
                      <span className="rl-bar">
                        <span style={{ width: `${Math.max(2, (c / max) * 100)}%`, background: m.color }} />
                      </span>
                      <span className="rl-cost mono">{money(c)}</span>
                    </li>
                  ))}
                </ul>
                {detailed && (
                  <p className="receipt-foot mono">
                    {(job.inTok / 1000).toFixed(0)}k tokens in · {(job.outTok / 1000).toFixed(1)}k out
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="fine-print">
          Assumes ~1.33 tokens per word and list prices. A 300-page book ≈ {BOOK_TOKENS.toLocaleString()} tokens.
        </p>
      </Chapter>

      {/* ── 4 · Memory ─────────────────────────────────────────────────── */}
      <Chapter
        n={4}
        id="memory"
        kicker="Memory"
        title="How much can they read at once?"
        lede="Each model has a limit on how much text it can keep in mind in one go — its “context window”. Here it is as 300-page books."
      >
        <div className="paper-card">
          <BookStacks models={released} />
        </div>
      </Chapter>

      {/* ── 5 · Progress ───────────────────────────────────────────────── */}
      {steps.length >= 2 && (
        <Chapter
          n={5}
          id="progress"
          kicker="Progress"
          title="Is it still getting better?"
          lede={
            <>
              Yes. The best available score rose by <b>{gain.toFixed(1)} points</b> in {months} month{months === 1 ? '' : 's'};
              each step is a new model taking the lead.
            </>
          }
        >
          <div className="paper-card">
            <FrontierSteps points={steps} />
          </div>
        </Chapter>
      )}

      {/* ── Go deeper ──────────────────────────────────────────────────── */}
      <section className="deeper" aria-labelledby="deeper-title">
        <h2 id="deeper-title" className="display deeper-title">
          Want the details?
        </h2>
        <div className="deeper-grid">
          {[
            ['/leaderboard', 'trophy', 'Full rankings', 'Every model, every test, sortable.'],
            ['/compare', 'compare', 'Compare two models', 'Side by side, winner per test.'],
            ['/models', 'grid', 'Model report cards', 'Grades and plain-English strengths.'],
            ['/methodology', 'flask', 'How we score', 'Where the numbers come from.'],
          ].map(([to, icon, title, sub]) => (
            <Link key={to} to={to} className="deeper-card">
              <span className="deeper-icon">
                <Icon name={icon} size={18} />
              </span>
              <span className="deeper-text">
                <b>{title}</b>
                <span>{sub}</span>
              </span>
              <Icon name="arrowRight" size={16} />
            </Link>
          ))}
        </div>
        {changes.length > 0 && (
          <p className="fine-print">
            Latest change: {changes[0].modelId} · {changes[0].field} → {changes[0].newValue} ({timeAgo(changes[0].at)}).{' '}
            <Link to="/data">See all changes</Link>.
          </p>
        )}
      </section>

      <HiddenTable
        caption={q.ask}
        headers={['Rank', 'Model', 'Answer']}
        rows={ranked.map(({ m, v }, i) => [String(i + 1), m.name, q.display(m, v)])}
      />
    </article>
  );
}
