import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePref = 'dark' | 'light' | 'system';
/** How much detail to show: plain-language first, or every number. */
export type Depth = 'simple' | 'detailed';
export type WeightOverrides = Record<string, number>;

interface Prefs {
  theme: ThemePref;
  resolvedTheme: 'dark' | 'light';
  setTheme(t: ThemePref): void;
  toggleTheme(): void;
  /** Relative weights per benchmark id; null = use the defaults from benchmarks.ts. */
  weights: WeightOverrides | null;
  setWeights(w: WeightOverrides | null): void;
  weightsOpen: boolean;
  setWeightsOpen(open: boolean): void;
  paletteOpen: boolean;
  setPaletteOpen(open: boolean): void;
  helpOpen: boolean;
  setHelpOpen(open: boolean): void;
  /** Simple = plain words and grades; Detailed = raw benchmark numbers. */
  depth: Depth;
  setDepth(d: Depth): void;
  /** Phone: the "More" sheet with every page is open. */
  navOpen: boolean;
  setNavOpen(v: boolean): void;
}

const Ctx = createContext<Prefs | null>(null);
const KEY = 'fmv:prefs:v1';

function read(): { theme?: ThemePref; weights?: WeightOverrides | null; depth?: Depth } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

const systemDark = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : true);

/** Per-viewer preferences, remembered in this browser (theme, custom weights, open panels). */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(read, []);
  const [theme, setTheme] = useState<ThemePref>(initial.theme ?? 'system');
  const [depth, setDepth] = useState<Depth>(initial.depth === 'detailed' ? 'detailed' : 'simple');
  const [weights, setWeights] = useState<WeightOverrides | null>(initial.weights ?? null);
  const [sysDark, setSysDark] = useState(systemDark);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setSysDark(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const resolvedTheme: 'dark' | 'light' = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0c0d12' : '#f3efe7');
  }, [resolvedTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme, weights, depth }));
    } catch {
      /* private mode etc. */
    }
  }, [theme, weights, depth]);

  const toggleTheme = useCallback(
    () => setTheme((t) => ((t === 'system' ? (sysDark ? 'dark' : 'light') : t) === 'dark' ? 'light' : 'dark')),
    [sysDark],
  );

  const value = useMemo<Prefs>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
      weights,
      setWeights,
      weightsOpen,
      setWeightsOpen,
      paletteOpen,
      setPaletteOpen,
      helpOpen,
      setHelpOpen,
      depth,
      setDepth,
      navOpen,
      setNavOpen,
    }),
    [theme, resolvedTheme, toggleTheme, weights, weightsOpen, paletteOpen, helpOpen, navOpen, depth],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return v;
}
