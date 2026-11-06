import type { Model } from '../src/data/types';
import type { ExternalModel } from './sources/types';

/** "GPT-6.1 Astra (xhigh)" → "gpt61astra"; "claude-fable-5-5" → "claudefable55". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

const hasVariant = (name: string) => /\(.+\)/.test(name);

export interface MatchResult {
  matches: Map<string, ExternalModel>; // our model id → external
  unmatchedModels: string[]; // our ids without a match
  unusedExternal: ExternalModel[]; // external records nobody claimed
}

/**
 * Match our models to a source's records:
 *  1. explicit link (alias or a previously stored external id),
 *  2. normalized name/slug equality — when a source lists several variants
 *     ("(high)", "(xhigh)") the plain name wins, otherwise the best-ranked one.
 * Each external record is used at most once.
 */
export function matchModels(
  ours: Pick<Model, 'id' | 'name' | 'status'>[],
  external: ExternalModel[],
  links: Record<string, string>,
): MatchResult {
  const byId = new Map(external.map((e) => [e.externalId, e]));
  const used = new Set<string>();
  const matches = new Map<string, ExternalModel>();

  for (const m of ours) {
    const link = links[m.id];
    const e = link ? byId.get(link) : undefined;
    if (e && !used.has(e.externalId)) {
      matches.set(m.id, e);
      used.add(e.externalId);
    }
  }

  for (const m of ours) {
    if (matches.has(m.id)) continue;
    const keys = new Set([normalizeName(m.name), normalizeName(m.id)]);
    const cands = external.filter(
      (e) => !used.has(e.externalId) && (keys.has(normalizeName(e.name)) || keys.has(normalizeName(e.externalId))),
    );
    if (!cands.length) continue;
    cands.sort((a, b) => Number(hasVariant(a.name)) - Number(hasVariant(b.name)) || (b.rank ?? -1) - (a.rank ?? -1));
    matches.set(m.id, cands[0]);
    used.add(cands[0].externalId);
  }

  return {
    matches,
    unmatchedModels: ours.filter((m) => !matches.has(m.id) && m.status === 'released').map((m) => m.id),
    unusedExternal: external.filter((e) => !used.has(e.externalId)),
  };
}

const PALETTE = [
  '#D97757',
  '#10A37F',
  '#4285F4',
  '#7C4DFF',
  '#4D6BFE',
  '#F59E0B',
  '#EC4899',
  '#14B8A6',
  '#84CC16',
  '#F97316',
  '#06B6D4',
  '#A855F7',
];

/** Stable colour per creator so imported models from one lab share a hue. */
export function colorFor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Keep variant tags like "(xhigh)" — they distinguish imports from seed models. */
export function shortNameFor(name: string): string {
  const s = name.trim();
  return s.length <= 22 ? s : `${s.slice(0, 21)}…`;
}
