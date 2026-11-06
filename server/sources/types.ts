import type { Config } from '../config';
import type { ScoreSource } from '../../src/data/types';

/** A model record as a source reports it, already mapped onto our benchmark ids & scales. */
export interface ExternalModel {
  externalId: string;
  name: string;
  creator?: string;
  releaseDate?: string | null;
  contextWindow?: number | null;
  costIn?: number | null;
  costOut?: number | null;
  outputTps?: number | null;
  ttft?: number | null;
  /** Our benchmark id → value on that benchmark's declared scale. Nulls are skipped. */
  scores: Record<string, number | null>;
  /** Used to rank imports and break ties between variants. Higher = better. */
  rank?: number;
}

export interface SourceFetchResult {
  models: ExternalModel[];
  /** Free-form note stored on the run (e.g. index version, rate-limit headroom). */
  note?: string;
}

/**
 * A data-source plugin. Add a file in server/sources/, implement this, and
 * register it in sources/index.ts — the ingest engine does matching, history,
 * change detection, events and scheduling for you.
 */
export interface SourcePlugin {
  id: string;
  label: string;
  /** How scores from this source are labelled in the UI. */
  scoreSource: ScoreSource;
  attribution?: { text: string; url: string };
  /** Human-readable list of what this source fills in. */
  provides(cfg: Config): string[];
  isConfigured(cfg: Config): boolean;
  /** How many unmatched top-ranked models to auto-import as new models (default 0). */
  importTop?(cfg: Config): number;
  /** Name aliases: our model id → this source's external id. */
  aliases?(cfg: Config): Record<string, string>;
  fetch(cfg: Config, fetchImpl: typeof fetch): Promise<SourceFetchResult>;
}
