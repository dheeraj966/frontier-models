import type { DataProvider } from '../types';
import { apiProvider } from './apiProvider';
import { staticProvider } from './staticProvider';

/**
 * Provider chain, tried in order until one loads:
 *   auto (default): local API server → CSV files bundled at build time
 * Force one with VITE_DATA_PROVIDER=api | static (GitHub Pages builds use static).
 */
const registry: Record<string, DataProvider> = { api: apiProvider, static: staticProvider };
const choice = (import.meta.env.VITE_DATA_PROVIDER as string | undefined) ?? 'auto';

export const providerChain: DataProvider[] = choice in registry ? [registry[choice]] : [apiProvider, staticProvider];

export { apiProvider, staticProvider };
