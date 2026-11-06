/// <reference types="vite/client" />

/** Injected by vite.config.ts at build time. */
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_DATA_PROVIDER?: 'auto' | 'api' | 'static';
  readonly VITE_API_BASE?: string;
}
