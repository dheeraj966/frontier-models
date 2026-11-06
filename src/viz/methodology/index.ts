import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const methodologyPlugin: VizPlugin = {
  id: 'methodology',
  title: 'Methodology',
  group: 'data',
  icon: 'flask',
  description: 'How scores are scaled and combined',
  path: '/methodology',
  component: lazy(load),
  preload: load,
  order: 21,
};
