// npm run ingest — pull live sources once and write the results into data/*.csv.
// Used by the GitHub Pages workflow to refresh the site daily.
import { loadConfig } from '../config';
import { EventBus } from '../events';
import { runIngest } from '../ingest';
import { sources } from '../sources';
import { CsvStore } from '../store';

const cfg = loadConfig();
const store = new CsvStore(cfg.dataDir);
const runs = await runIngest({ store, cfg, bus: new EventBus(), sources, fetchImpl: fetch }, { trigger: 'cli' });
for (const r of runs) console.log(`${r.status.toUpperCase().padEnd(7)} ${r.sourceId}${r.message ? ` — ${r.message}` : ''}`);
process.exit(runs.some((r) => r.status === 'error') ? 1 : 0);
