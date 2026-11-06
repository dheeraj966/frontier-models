import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLUMNS,
  FILES,
  currentScores,
  parseTables,
  serializeTable,
  toPayload,
  type RawTables,
  type TableName,
  type Tables,
} from '../src/lib/dataset';
import { toCsv } from '../src/lib/csv';
import type { DatasetMeta, IngestRun, Score, ScorePoint } from '../src/data/types';

const MAX_RUNS = 500;
const MAX_CHANGES = 5000;

/**
 * The "database": plain CSV files in one folder, held in memory and written
 * back atomically (temp file + rename). Edits you make to the files by hand —
 * in Excel, Sheets or a text editor — are picked up on the next request.
 */
export class CsvStore {
  private tables!: Tables;
  private raw: RawTables = {};
  private mtimes = new Map<TableName, number>();

  constructor(readonly dir: string) {
    this.load();
  }

  path(t: TableName) {
    return join(this.dir, `${t}.csv`);
  }

  load() {
    mkdirSync(this.dir, { recursive: true });
    for (const t of FILES) {
      const p = this.path(t);
      if (!existsSync(p)) {
        if (t === 'models' || t === 'benchmarks') throw new Error(`Missing ${p} — this file defines your ${t}.`);
        writeFileSync(p, toCsv([], COLUMNS[t]));
      }
      this.raw[t] = readFileSync(p, 'utf8');
      this.mtimes.set(t, statSync(p).mtimeMs);
    }
    this.tables = parseTables(this.raw);
  }

  /** Re-read if any file changed on disk since we last looked (cheap: 5 stat calls). */
  refresh(): boolean {
    for (const t of FILES) {
      const p = this.path(t);
      if (!existsSync(p) || statSync(p).mtimeMs !== this.mtimes.get(t)) {
        this.load();
        return true;
      }
    }
    return false;
  }

  get data(): Tables {
    return this.tables;
  }

  /** Persist the given tables. Throws a friendly error if a file is locked (e.g. open in Excel). */
  save(names: TableName[]) {
    for (const t of names) {
      const text = serializeTable(t, this.tables);
      const p = this.path(t);
      const tmp = `${p}.tmp`;
      try {
        writeFileSync(tmp, text);
        renameSync(tmp, p);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EBUSY' || code === 'EPERM')
          throw new Error(`${t}.csv is locked — close it in Excel and try again.`, { cause: err });
        throw err;
      }
      this.raw[t] = text;
      this.mtimes.set(t, statSync(p).mtimeMs);
    }
  }

  currentScores(): Score[] {
    const known = new Set(this.tables.models.map((m) => m.id));
    return currentScores(this.tables.points.filter((p) => known.has(p.modelId)));
  }

  history(modelId: string): ScorePoint[] {
    return this.tables.points
      .filter((p) => p.modelId === modelId)
      .sort((a, b) => a.benchmarkId.localeCompare(b.benchmarkId) || a.asOf.localeCompare(b.asOf));
  }

  runs(limit = 20): IngestRun[] {
    return [...this.tables.runs].sort((a, b) => b.id - a.id).slice(0, limit);
  }

  lastRun(sourceId: string, status?: IngestRun['status']): IngestRun | undefined {
    return this.runs(MAX_RUNS).find((r) => r.sourceId === sourceId && (!status || r.status === status));
  }

  startRun(sourceId: string, trigger: IngestRun['trigger']): IngestRun {
    const id = Math.max(0, ...this.tables.runs.map((r) => r.id)) + 1;
    const run: IngestRun = {
      id,
      sourceId,
      trigger,
      startedAt: new Date().toISOString(),
      status: 'running',
      matched: 0,
      imported: 0,
      changed: 0,
    };
    this.tables.runs.push(run);
    return run;
  }

  finishRun(run: IngestRun, patch: Partial<IngestRun> & Pick<IngestRun, 'status'>): IngestRun {
    Object.assign(run, patch, { finishedAt: new Date().toISOString() });
    this.tables.runs = this.runs(MAX_RUNS).reverse();
    this.tables.changes = this.tables.changes.slice(-MAX_CHANGES);
    this.save(['runs', 'changes']);
    return run;
  }

  /** Runs left "running" by a crash are closed on boot. */
  closeStaleRuns() {
    let n = 0;
    for (const r of this.tables.runs)
      if (r.status === 'running') {
        r.status = 'error';
        r.message = 'Interrupted (server stopped)';
        n++;
      }
    if (n) this.save(['runs']);
  }

  payload(meta: DatasetMeta) {
    return toPayload(this.tables, meta, this.raw);
  }

  files() {
    const counts: Record<TableName, number> = {
      models: this.tables.models.length,
      benchmarks: this.tables.benchmarks.length,
      scores: this.tables.points.length,
      runs: this.tables.runs.length,
      changes: this.tables.changes.length,
    };
    return FILES.map((t) => {
      const st = statSync(this.path(t));
      return { name: `${t}.csv`, rows: counts[t], bytes: st.size, updatedAt: new Date(st.mtimeMs).toISOString() };
    });
  }

  rawFile(name: string): string | undefined {
    const t = name.replace(/\.csv$/, '') as TableName;
    return FILES.includes(t) ? this.raw[t] : undefined;
  }
}
