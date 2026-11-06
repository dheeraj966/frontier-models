import { resolve } from 'node:path';

// Load .env (Node ≥ 20.12 built-in). Missing file is fine.
try {
  process.loadEnvFile?.();
} catch {
  /* no .env */
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};

export interface Config {
  port: number;
  /** Folder holding the CSV files (models, benchmarks, scores, runs, changes). */
  dataDir: string;
  /** Slack/Discord/Teams-compatible webhook pinged when live data changes. */
  notifyWebhook?: string;
  /** Artificial Analysis API key — enables the live source. */
  aaApiKey?: string;
  /** 'free' uses /language/models/free; 'pro' also pulls per-benchmark evals. */
  aaTier: 'free' | 'pro';
  /** Import the top-N AA models that aren't in models.ts (0 = off). */
  aaImportTop: number;
  /** Hours between automatic refreshes (0 disables the scheduler). */
  refreshHours: number;
  /** If set, POST /api/ingest requires `Authorization: Bearer <token>`. */
  adminToken?: string;
  /** Serve the built frontend from ./dist (production). */
  serveStatic: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Config {
  return {
    port: num(env.PORT, 8787),
    dataDir: resolve(env.DATA_DIR || 'data'),
    notifyWebhook: env.NOTIFY_WEBHOOK_URL?.trim() || undefined,
    aaApiKey: env.AA_API_KEY?.trim() || undefined,
    aaTier: env.AA_TIER === 'pro' ? 'pro' : 'free',
    aaImportTop: Math.max(0, Math.floor(num(env.AA_IMPORT_TOP, 0))),
    refreshHours: Math.max(0, num(env.REFRESH_HOURS, 24)),
    adminToken: env.ADMIN_TOKEN?.trim() || undefined,
    serveStatic: argv.includes('--serve-static') || env.SERVE_STATIC === '1',
  };
}
