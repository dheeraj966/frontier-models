import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const modelsPlugin: VizPlugin = {
  id: 'models',
  title: 'Models',
  group: 'main',
  icon: 'grid',
  description: 'Directory of every tracked model',
  path: '/models',
  component: lazy(load),
  preload: load,
  order: 2,
};
