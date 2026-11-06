import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const radarPlugin: VizPlugin = {
  id: 'radar',
  title: 'Radar',
  group: 'explore',
  icon: 'radar',
  description: 'Benchmark shape per model',
  path: '/radar',
  component: lazy(load),
  preload: load,
  order: 10,
};
