import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const dataPlugin: VizPlugin = {
  id: 'data',
  title: 'Data & API',
  group: 'data',
  icon: 'database',
  description: 'CSV files, sources, refresh log and API',
  path: '/data',
  component: lazy(load),
  preload: load,
  order: 20,
};
