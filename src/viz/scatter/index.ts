import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const scatterPlugin: VizPlugin = {
  id: 'scatter',
  title: 'Cost vs score',
  group: 'explore',
  icon: 'scatter',
  description: 'Price against score, with the value frontier',
  path: '/scatter',
  component: lazy(load),
  preload: load,
  order: 13,
};
