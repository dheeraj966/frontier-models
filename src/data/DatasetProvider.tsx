import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Benchmark,
  ChangeEvent,
  DatasetMeta,
  DatasetPayload,
  DataProvider,
  IngestRun,
  Model,
  Score,
  ScorePoint,
} from './types';
import { providerChain } from './providers';
import { usePreferences } from '../state/preferences';
import { useToast } from '../components/Toasts';
import { buildScoreLookup, compositeScore } from '../utils/scores';

export type LiveStatus = 'off' | 'connecting' | 'live';

interface Dataset {
  models: Model[];
  /** Benchmarks with the viewer's custom weights applied (use these for composites). */
  benchmarks: Benchmark[];
  /** Benchmarks exactly as the data source defines them. */
  baseBenchmarks: Benchmark[];
  scores: Score[];
  meta: DatasetMeta | null;
  runs: IngestRun[];
  changes: ChangeEvent[];
  files: NonNullable<DatasetPayload['files']>;
  lookup: Map<string, number | null>;
  composites: Map<string, number | null>;
  loading: boolean;
  error: string | null;
  /** Every value is mock (no live score or price/speed). */
  isMock: boolean;
  liveValueCount: number;
  providerId: string;
  customWeights: boolean;
  liveStatus: LiveStatus;
  refreshing: boolean;
  reload(): Promise<void>;
  refresh?: () => Promise<void>;
  getHistory?: (modelId: string) => Promise<ScorePoint[]>;
}

const Ctx = createContext<Dataset | null>(null);

interface Loaded {
  models: Model[];
  benchmarks: Benchmark[];
  scores: Score[];
  meta: DatasetMeta | null;
  runs: IngestRun[];
  changes: ChangeEvent[];
  files: NonNullable<DatasetPayload['files']>;
  provider: DataProvider | null;
}

async function loadFromChain(): Promise<Loaded> {
  let lastErr: unknown;
  for (const p of providerChain) {
    try {
      const d = await p.load();
      return { ...d, runs: d.runs ?? [], changes: d.changes ?? [], files: d.files ?? [], provider: p };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const { weights } = usePreferences();
  const toast = useToast();
  const [data, setData] = useState<Loaded>({
    models: [],
    benchmarks: [],
    scores: [],
    meta: null,
    runs: [],
    changes: [],
    files: [],
    provider: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('off');
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const d = await loadFromChain();
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  // Server push: refresh the dataset when an ingest changes something.
  const provider = data.provider;
  useEffect(() => {
    if (!provider?.subscribe) return;
    setLiveStatus('connecting');
    const off = provider.subscribe((e) => {
      if (e.type === 'hello') setLiveStatus('live');
      if (e.type === 'ingest-started') setRefreshing(true);
      if (e.type === 'ingest-finished') {
        setRefreshing(false);
        const r = e.run;
        if (r.status === 'ok' && r.changed + r.imported > 0) {
          void reload();
          toast.push({
            tone: 'success',
            title: 'Live data updated',
            body: `${r.changed} value${r.changed === 1 ? '' : 's'} changed${r.imported ? `, ${r.imported} new model${r.imported === 1 ? '' : 's'}` : ''} · ${r.sourceId}`,
          });
        } else if (r.status === 'ok') {
          void reload();
        } else if (r.status === 'error' && r.trigger !== 'manual') {
          toast.push({ tone: 'error', title: 'Scheduled refresh failed', body: r.message });
        }
      }
    });
    return () => {
      off();
      setLiveStatus('off');
    };
  }, [provider, reload, toast]);

  const refresh = useMemo(() => {
    if (!provider?.refresh || !data.meta?.canRefresh) return undefined;
    const fn = provider.refresh.bind(provider);
    return async () => {
      setRefreshing(true);
      const r = await fn();
      setRefreshing(false);
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Refresh complete' : 'Refresh failed', body: r.message });
      await reload();
    };
  }, [provider, data.meta?.canRefresh, reload, toast]);

  const value = useMemo<Dataset>(() => {
    const benchmarks = weights ? data.benchmarks.map((b) => ({ ...b, weight: weights[b.id] ?? b.weight })) : data.benchmarks;
    const lookup = buildScoreLookup(data.scores);
    const composites = new Map(data.models.map((m) => [m.id, compositeScore(benchmarks, lookup, m.id)]));
    const liveValueCount =
      data.scores.filter((s) => s.source !== 'mock' && s.value !== null).length +
      data.models.filter((m) => m.statsSource && m.statsSource !== 'mock').length;
    return {
      models: data.models,
      benchmarks,
      baseBenchmarks: data.benchmarks,
      scores: data.scores,
      meta: data.meta,
      runs: data.runs,
      changes: data.changes,
      files: data.files,
      lookup,
      composites,
      loading,
      error,
      isMock: liveValueCount === 0,
      liveValueCount,
      providerId: data.provider?.id ?? '—',
      customWeights: weights !== null,
      liveStatus,
      refreshing,
      reload,
      refresh,
      getHistory: provider?.getHistory?.bind(provider),
    };
  }, [data, weights, loading, error, liveStatus, refreshing, reload, refresh, provider]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDataset(): Dataset {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDataset must be used inside <DatasetProvider>');
  return v;
}
