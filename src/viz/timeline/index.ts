import { lazy } from 'react';
import type { VizPlugin } from '../types';

const load = () => import('./Page');

export const timelinePlugin: VizPlugin = {
  id: 'timeline',
  title: 'Timeline',
  group: 'explore',
  icon: 'timeline',
  description: 'Scores by release date and the frontier record',
  path: '/timeline',
  component: lazy(load),
  preload: load,
  order: 14,
};
