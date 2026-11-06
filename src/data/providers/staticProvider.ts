import type { DataProvider } from '../types';
import { parseTables, toPayload, type RawTables } from '../../lib/dataset';
import models from '../../../data/models.csv?raw';
import benchmarks from '../../../data/benchmarks.csv?raw';
import scores from '../../../data/scores.csv?raw';
import runs from '../../../data/runs.csv?raw';
import changes from '../../../data/changes.csv?raw';

/** The CSV files in /data, bundled into the site at build time. Works with no server (GitHub Pages). */
export const bundledRaw: RawTables = { models, benchmarks, scores, runs, changes };

export const staticProvider: DataProvider = {
  id: 'static',
  label: 'Static build',
  isMock: false,
  async getHistory(modelId) {
    return parseTables(bundledRaw)
      .points.filter((p) => p.modelId === modelId)
      .sort((a, b) => a.asOf.localeCompare(b.asOf));
  },
  async load() {
    const tables = parseTables(bundledRaw);
    return toPayload(
      tables,
      {
        provider: 'static',
        generatedAt: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : new Date().toISOString(),
        canRefresh: false,
      },
      bundledRaw,
    );
  },
};
