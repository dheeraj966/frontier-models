import type { Config } from '../config';
import type { ExternalModel, SourcePlugin } from './types';

/**
 * Artificial Analysis Data API (https://artificialanalysis.ai/data-api/docs).
 *  - Free key:  GET /api/v2/language/models/free → Intelligence Index, prices, speed, TTFT, release date.
 *  - Pro key:   GET /api/v2/language/models      → adds per-benchmark evals (GPQA Diamond, MMMU-Pro …)
 *               and context window.
 * Free tier: 100 requests / 24 h; one refresh uses 1–2 requests.
 * Attribution is required wherever the data is shown (the UI footer does this).
 */
const DEFAULT_BASE = 'https://artificialanalysis.ai/api/v2/language/models';

interface AAModel {
  id: string;
  name: string;
  slug: string;
  release_date?: string | null;
  model_creator?: { id?: string; name?: string } | null;
  evaluations?: Record<string, number | null> | null;
  pricing?: Record<string, number | null> | null;
  performance?: Record<string, number | null> | null;
  context_window_tokens?: number | null;
}

interface AAPage {
  tier?: string;
  intelligence_index_version?: number;
  pagination?: { page: number; total_pages: number; has_more: boolean };
  data: AAModel[];
}

/** AA evaluation key → [our benchmark id, multiplier onto our scale]. */
const EVAL_MAP: Record<string, [string, number]> = {
  artificial_analysis_intelligence_index: ['aa-intelligence-index', 1],
  // Pro-only per-benchmark evals come back as fractions (0.917 → 91.7%).
  gpqa_diamond: ['gpqa-diamond', 100],
  mmmu_pro: ['mmmu-pro', 100],
};

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function mapAAModel(m: AAModel): ExternalModel {
  const scores: Record<string, number | null> = {};
  for (const [key, [benchId, mult]] of Object.entries(EVAL_MAP)) {
    const v = n(m.evaluations?.[key]);
    if (v !== null) scores[benchId] = Math.round(v * mult * 100) / 100;
  }
  return {
    externalId: m.slug,
    name: m.name,
    creator: m.model_creator?.name ?? undefined,
    releaseDate: m.release_date ?? null,
    contextWindow: n(m.context_window_tokens),
    costIn: n(m.pricing?.price_1m_input_tokens),
    costOut: n(m.pricing?.price_1m_output_tokens),
    outputTps: n(m.performance?.median_output_tokens_per_second),
    ttft: n(m.performance?.median_time_to_first_token_seconds),
    scores,
    rank: n(m.evaluations?.artificial_analysis_intelligence_index) ?? undefined,
  };
}

export class SourceError extends Error {}

export const artificialAnalysis: SourcePlugin = {
  id: 'artificial-analysis',
  label: 'Artificial Analysis',
  scoreSource: 'leaderboard',
  attribution: { text: 'Artificial Analysis', url: 'https://artificialanalysis.ai/' },
  provides: (cfg) =>
    cfg.aaTier === 'pro'
      ? ['AA Intelligence Index', 'GPQA Diamond', 'MMMU-Pro', 'prices', 'speed', 'latency', 'context window', 'release dates']
      : ['AA Intelligence Index', 'prices', 'speed', 'latency', 'release dates'],
  isConfigured: (cfg) => Boolean(cfg.aaApiKey),
  aliases: (cfg) => parseAliases(process.env.AA_ALIASES, cfg),
  importTop: (cfg) => cfg.aaImportTop,
  async fetch(cfg, fetchImpl) {
    if (!cfg.aaApiKey) throw new SourceError('AA_API_KEY is not set');
    const base = (process.env.AA_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
    const url = cfg.aaTier === 'pro' ? base : `${base}/free`;
    const out: ExternalModel[] = [];
    let version: number | undefined;
    let remaining: string | null = null;
    for (let page = 1; page <= 10; page++) {
      const res = await fetchImpl(`${url}?page=${page}`, {
        headers: { 'x-api-key': cfg.aaApiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
      remaining = res.headers.get('x-ratelimit-remaining');
      if (res.status === 401) throw new SourceError('API key rejected (401). Check AA_API_KEY.');
      if (res.status === 403) {
        throw new SourceError(
          cfg.aaTier === 'pro' ? 'This key has no Pro access (403). Set AA_TIER=free.' : 'Access denied (403). Check AA_API_KEY.',
        );
      }
      if (res.status === 429) {
        const after = res.headers.get('retry-after');
        throw new SourceError(
          `Rate limited by Artificial Analysis (429)${after ? `; retry in ${Math.ceil(Number(after) / 60)} min` : ''}.`,
        );
      }
      if (!res.ok) throw new SourceError(`Artificial Analysis returned HTTP ${res.status}.`);
      const body = (await res.json()) as AAPage;
      if (!Array.isArray(body?.data)) throw new SourceError('Unexpected response shape from Artificial Analysis.');
      version ??= body.intelligence_index_version;
      out.push(...body.data.map(mapAAModel));
      if (!body.pagination?.has_more) break;
    }
    const bits = [`${out.length} models`];
    if (version !== undefined) bits.push(`Intelligence Index v${version}`);
    if (remaining !== null) bits.push(`${remaining} API calls left today`);
    return { models: out, note: bits.join(' · ') };
  },
};

/** AA_ALIASES="our-model-id=aa-slug,other-id=other-slug" */
function parseAliases(raw: string | undefined, _cfg: Config): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pair of (raw ?? '').split(',')) {
    const [k, v] = pair.split('=').map((s) => s?.trim());
    if (k && v) map[k] = v;
  }
  return map;
}
