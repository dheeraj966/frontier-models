import type { ComponentType, LazyExoticComponent } from 'react';

export type VizProps = Record<string, never>;

/**
 * A visualization plugin. To add a view: create viz/<name>/{index.ts,Page.tsx}
 * and add it to registry.ts — routing, nav tab, number-key shortcut and the
 * command palette pick it up automatically.
 */
export type NavGroup = 'main' | 'explore' | 'data';

export interface VizPlugin {
  id: string;
  title: string;
  /** Sidebar section. */
  group: NavGroup;
  /** Icon name from components/Icon.tsx. */
  icon: string;
  description: string;
  path: string;
  component: ComponentType<VizProps> | LazyExoticComponent<ComponentType<VizProps>>;
  /** Warm the lazy chunk (called on nav hover/focus). */
  preload?: () => Promise<unknown>;
  order: number;
}
