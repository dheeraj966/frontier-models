import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const leaderboardPlugin: VizPlugin = {
  id: 'leaderboard',
  title: 'Rankings',
  group: 'main',
  icon: 'trophy',
  description: 'Ranked by category with every benchmark, price and speed',
  path: '/leaderboard',
  component: lazy(load),
  preload: load,
  order: 1,
};
