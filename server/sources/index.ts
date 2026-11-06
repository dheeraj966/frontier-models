import type { SourcePlugin } from './types';
import { artificialAnalysis } from './artificialAnalysis';

/** Registered live-data sources, applied in order (later sources win ties on the same day). */
export const sources: SourcePlugin[] = [artificialAnalysis];

export type { SourcePlugin } from './types';
