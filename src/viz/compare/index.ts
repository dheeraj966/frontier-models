import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const comparePlugin: VizPlugin = {
  id: 'compare',
  title: 'Compare',
  group: 'main',
  icon: 'compare',
  description: 'Head-to-head: 2–4 models side by side',
  path: '/compare',
  component: lazy(load),
  preload: load,
  order: 3,
};
