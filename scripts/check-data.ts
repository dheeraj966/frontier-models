// npm run check:data — fails CI if the CSV files in /data are inconsistent.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FILES, currentScores, parseTables, type RawTables } from '../src/lib/dataset';
import { validateDataset } from './validate';

const dir = resolve(process.env.DATA_DIR || 'data');
const raw: RawTables = {};
for (const f of FILES) {
  try {
    raw[f] = readFileSync(resolve(dir, `${f}.csv`), 'utf8');
  } catch {
    if (f === 'models' || f === 'benchmarks' || f === 'scores') {
      console.error(`✗ missing ${f}.csv in ${dir}`);
      process.exit(1);
    }
  }
}
const t = parseTables(raw);
const errs = validateDataset(t.models, t.benchmarks, currentScores(t.points));
if (errs.length) {
  console.error(`✗ ${errs.length} data problem${errs.length === 1 ? '' : 's'} in ${dir}:`);
  for (const e of errs) console.error(`  • ${e}`);
  process.exit(1);
}
console.log(
  `✓ data OK — ${t.models.length} models, ${t.benchmarks.length} benchmarks, ${t.points.length} score rows, ${t.runs.length} runs, ${t.changes.length} changes`,
);
