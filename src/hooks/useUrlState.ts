import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface Codec<T> {
  parse(raw: string): T | undefined;
  serialize(v: T): string;
  equals?(a: T, b: T): boolean;
}

export const str: Codec<string> = { parse: (r) => r, serialize: (v) => v };
export const bool: Codec<boolean> = {
  parse: (r) => (r === '1' ? true : r === '0' ? false : undefined),
  serialize: (v) => (v ? '1' : '0'),
};
export const list: Codec<string[]> = {
  parse: (r) => (r === '' ? [] : r.split(',').filter(Boolean)),
  serialize: (v) => v.join(','),
  equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
};
export const oneOf = <T extends string>(...values: T[]): Codec<T> => ({
  parse: (r) => (values.includes(r as T) ? (r as T) : undefined),
  serialize: (v) => v,
});

/**
 * useState that lives in the URL query (?key=value), so every view is a
 * shareable link. Defaults are omitted from the URL to keep links short.
 * Uses `replace` so toggling chips doesn't flood browser history.
 */
let pending: URLSearchParams | null = null;

export function useUrlState<T>(key: string, fallback: T, codec: Codec<T>): [T, (next: T | ((prev: T) => T)) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = useMemo(() => (raw === null ? fallback : (codec.parse(raw) ?? fallback)), [raw, fallback, codec]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      // React Router's functional setSearchParams doesn't chain within one tick, so two
      // setters called back-to-back (e.g. sort key + direction) would drop the first.
      // Accumulate into one pending URLSearchParams per tick instead.
      const base = pending ?? new URLSearchParams(window.location.search);
      const cur = base.get(key);
      const curVal = cur === null ? fallback : (codec.parse(cur) ?? fallback);
      const v = typeof next === 'function' ? (next as (p: T) => T)(curVal) : next;
      const same = codec.equals ? codec.equals(v, fallback) : v === fallback;
      if (same) base.delete(key);
      else base.set(key, codec.serialize(v));
      if (!pending) queueMicrotask(() => (pending = null));
      pending = base;
      setParams(new URLSearchParams(base), { replace: true });
    },
    [key, fallback, codec, setParams],
  );
  return [value, set];
}
