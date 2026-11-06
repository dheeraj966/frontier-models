import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const heatmapPlugin: VizPlugin = {
  id: 'heatmap',
  title: 'Heatmap',
  group: 'explore',
  icon: 'heatmap',
  description: 'Every score as a colour grid',
  path: '/heatmap',
  component: lazy(load),
  preload: load,
  order: 12,
};
