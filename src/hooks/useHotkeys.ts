import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};

/**
 * Global keyboard shortcuts. Keys: "k", "1", "?", "ArrowLeft", "mod+k"
 * (mod = Ctrl on Windows/Linux, ⌘ on macOS). Ignored while typing in a field,
 * except "mod+…" combos and "Escape".
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const combo = mod ? `mod+${key}` : key;
      const fn = ref.current[combo] ?? (e.key === '?' ? ref.current['?'] : undefined);
      if (!fn) return;
      if (!mod && e.key !== 'Escape' && isTyping(e.target)) return;
      if (!mod && (e.altKey || e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
