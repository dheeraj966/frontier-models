import type { Config } from './config';
import type { EventBus } from './events';
import type { SourcePlugin } from './sources/types';
import type { CsvStore } from './store';

export interface AppContext {
  store: CsvStore;
  cfg: Config;
  bus: EventBus;
  sources: SourcePlugin[];
  fetchImpl: typeof fetch;
  /** Filled in by the scheduler when running. */
  nextRefreshAt?: () => string | undefined;
}
