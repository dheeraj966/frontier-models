import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const overviewPlugin: VizPlugin = {
  id: 'overview',
  title: 'Home',
  group: 'main',
  icon: 'home',
  description: 'Which AI is best right now — explained in plain words',
  path: '/',
  component: lazy(load),
  preload: load,
  order: 0,
};
