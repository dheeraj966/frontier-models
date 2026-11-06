import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const barsPlugin: VizPlugin = {
  id: 'bars',
  title: 'Bars',
  group: 'explore',
  icon: 'bars',
  description: 'Grouped bars, or one benchmark raw',
  path: '/bars',
  component: lazy(load),
  preload: load,
  order: 11,
};
