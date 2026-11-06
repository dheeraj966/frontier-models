import type { NavGroup, VizPlugin } from './types';
import { overviewPlugin } from './overview';
import { leaderboardPlugin } from './leaderboard';
import { modelsPlugin } from './models';
import { comparePlugin } from './compare';
import { radarPlugin } from './radar';
import { barsPlugin } from './bars';
import { heatmapPlugin } from './heatmap';
import { scatterPlugin } from './scatter';
import { timelinePlugin } from './timeline';
import { dataPlugin } from './data';
import { methodologyPlugin } from './methodology';

/**
 * Every page in the app. Add a folder with index.ts + Page.tsx and list it here:
 * the sidebar, route, number-key shortcut and search entry come for free.
 */
export const vizPlugins: VizPlugin[] = [
  overviewPlugin,
  leaderboardPlugin,
  modelsPlugin,
  comparePlugin,
  radarPlugin,
  barsPlugin,
  heatmapPlugin,
  scatterPlugin,
  timelinePlugin,
  dataPlugin,
  methodologyPlugin,
]
  .slice()
  .sort((a, b) => a.order - b.order);

export const NAV_GROUPS: { id: NavGroup; label?: string }[] = [
  { id: 'main' },
  { id: 'explore', label: 'Explore' },
  { id: 'data', label: 'Data' },
];
