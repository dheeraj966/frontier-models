export type ModelStatus = 'released' | 'expected' | 'rumored';

export interface Model {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  family: string;
  status: ModelStatus;
  baseline?: boolean; // previous-gen reference model
  releaseDate?: string; // ISO; undefined for expected
  color: string;
  contextWindow?: number; // tokens
  costPerMTokIn?: number; // USD per 1M input tokens
  costPerMTokOut?: number; // USD per 1M output tokens
  outputTokensPerSec?: number; // median output speed (live sources only)
  ttftSeconds?: number; // median time to first token (live sources only)
  /** Where price/speed figures came from ("mock" until a live source updates them). */
  statsSource?: ScoreSource;
  statsAsOf?: string;
  /** 'seed' = row you added to data/models.csv · 'import' = auto-imported from a live source. */
  origin?: 'seed' | 'import';
  /** Artificial Analysis slug, filled in after the first successful match (or by hand). */
  aaSlug?: string;
  notes?: string;
}

export type BenchmarkCategory =
  'knowledge' | 'reasoning' | 'math' | 'coding' | 'multimodal' | 'agentic' | 'human-preference' | 'aggregate';

export interface Benchmark {
  id: string;
  name: string;
  shortName: string;
  category: BenchmarkCategory;
  min: number;
  max: number;
  unit: '%' | 'elo' | 'score';
  direction: 'higher-better' | 'lower-better';
  weight: number; // composite score weight (sums to 1)
  description?: string;
}

export type ScoreSource = 'mock' | 'vendor' | 'leaderboard' | 'community';

export interface Score {
  modelId: string;
  benchmarkId: string;
  value: number | null; // null = not evaluated
  source: ScoreSource;
  asOf?: string;
  /** Which source plugin produced it (e.g. "artificial-analysis"). */
  sourceId?: string;
}

/** One historical observation of a score (the API keeps every ingest). */
export interface ScorePoint {
  modelId: string;
  benchmarkId: string;
  value: number | null;
  source: ScoreSource;
  sourceId?: string;
  asOf: string;
}

export interface IngestRun {
  id: number;
  sourceId: string;
  trigger: 'schedule' | 'manual' | 'cli' | 'startup';
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'ok' | 'error' | 'skipped';
  message?: string;
  matched: number;
  imported: number;
  changed: number;
  unmatched?: string[];
}

export interface SourceInfo {
  id: string;
  label: string;
  configured: boolean;
  attribution?: { text: string; url: string };
  provides: string[];
  lastRun?: IngestRun;
}

/** One value that changed during an ingest (the activity feed). */
export interface ChangeEvent {
  at: string;
  sourceId: string;
  modelId: string;
  /** Benchmark id, or a model field such as "input_price". */
  field: string;
  oldValue: number | null;
  newValue: number | null;
}

export interface DatasetMeta {
  /** Which provider actually served this dataset. */
  provider: 'api' | 'static';
  generatedAt: string;
  sources: SourceInfo[];
  /** Server can run an ingest right now (has a configured source). */
  canRefresh: boolean;
  nextRefreshAt?: string;
}

export interface DatasetPayload {
  models: Model[];
  benchmarks: Benchmark[];
  scores: Score[];
  meta: DatasetMeta;
  /** Most recent ingest runs, newest first. */
  runs: IngestRun[];
  /** Most recent value changes, newest first. */
  changes: ChangeEvent[];
  /** The raw CSV files behind this dataset (for the Data page downloads). */
  files?: { name: string; rows: number; bytes: number; updatedAt?: string }[];
}

export interface DataProvider {
  id: string;
  label: string;
  isMock: boolean;
  load(): Promise<DatasetPayload>;
  /** Optional: full score history for one model (API only). */
  getHistory?(modelId: string): Promise<ScorePoint[]>;
  /** Optional: ask the backend to refresh from live sources. */
  refresh?(): Promise<{ ok: boolean; message: string }>;
  /** Optional: subscribe to server-pushed updates. Returns an unsubscribe fn. */
  subscribe?(onEvent: (e: ServerEvent) => void): () => void;
}

export type ServerEvent =
  | { type: 'ingest-started'; sourceId: string; trigger: string }
  | { type: 'ingest-finished'; run: IngestRun }
  | { type: 'hello'; at: string };
