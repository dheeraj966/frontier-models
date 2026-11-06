import type { AppContext } from './context';
import { runIngest } from './ingest';

const HOUR = 3_600_000;
const RETRY_AFTER_ERROR = HOUR; // don't hammer a failing source (AA free tier = 100 calls/day)

/**
 * Keeps live data fresh while the server runs: checks every 10 minutes and
 * refreshes any configured source whose last good pull is older than
 * REFRESH_HOURS. Survives restarts because state lives in ingest_runs.
 */
export function startScheduler(ctx: AppContext) {
  const { cfg, store } = ctx;
  if (cfg.refreshHours <= 0) return { stop() {}, nextRunAt: () => undefined };
  const period = cfg.refreshHours * HOUR;
  let first = true;

  const dueSources = () =>
    ctx.sources.filter((s) => {
      if (!s.isConfigured(cfg)) return false;
      const ok = store.lastRun(s.id, 'ok');
      const last = store.lastRun(s.id);
      if (last?.status === 'error' && Date.now() - Date.parse(last.startedAt) < RETRY_AFTER_ERROR) return false;
      return !ok || Date.now() - Date.parse(ok.startedAt) >= period;
    });

  const tick = async () => {
    const due = dueSources();
    if (due.length) {
      const runs = await runIngest(ctx, { trigger: first ? 'startup' : 'schedule', sourceIds: due.map((s) => s.id) });
      for (const r of runs) console.log(`[ingest] ${r.sourceId}: ${r.status}${r.message ? ` — ${r.message}` : ''}`);
    }
    first = false;
  };

  const boot = setTimeout(() => void tick(), 3_000);
  const timer = setInterval(() => void tick(), 10 * 60_000);
  boot.unref?.();
  timer.unref?.();

  const nextRunAt = () => {
    const times = ctx.sources
      .filter((s) => s.isConfigured(cfg))
      .map((s) => {
        const ok = store.lastRun(s.id, 'ok');
        return ok ? Date.parse(ok.startedAt) + period : Date.now();
      });
    return times.length ? new Date(Math.min(...times)).toISOString() : undefined;
  };
  ctx.nextRefreshAt = nextRunAt;

  return {
    stop: () => {
      clearTimeout(boot);
      clearInterval(timer);
    },
    nextRunAt,
  };
}
