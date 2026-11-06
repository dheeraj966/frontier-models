import { describe, expect, it } from 'vitest';
import { colorFor, matchModels, normalizeName } from '../matching';
import type { ExternalModel } from '../sources/types';

const ext = (externalId: string, name: string, rank?: number): ExternalModel => ({ externalId, name, scores: {}, rank });

describe('normalizeName', () => {
  it('ignores punctuation, case and variant tags', () => {
    expect(normalizeName('GPT-6.1 Astra (xhigh)')).toBe('gpt61astra');
    expect(normalizeName('claude-fable-5.5')).toBe(normalizeName('Claude Fable 5.5'));
  });
});

describe('matchModels', () => {
  const ours = [
    { id: 'gpt-6.1-astra', name: 'GPT-6.1 Astra', status: 'released' as const },
    { id: 'claude-fable-5.5', name: 'Claude Fable 5.5', status: 'released' as const },
    { id: 'kimi-k3.1', name: 'Kimi K3.1', status: 'released' as const },
  ];
  it('prefers the plain variant, then the best-ranked one', () => {
    const r = matchModels(ours, [ext('a-xhigh', 'GPT-6.1 Astra (xhigh)', 70), ext('a', 'GPT-6.1 Astra', 60)], {});
    expect(r.matches.get('gpt-6.1-astra')?.externalId).toBe('a');
    expect(r.unusedExternal.map((e) => e.externalId)).toEqual(['a-xhigh']);
  });
  it('matches by slug and honours explicit links', () => {
    const r = matchModels(ours, [ext('claude-fable-5-5', 'Fable Five'), ext('moonshot-k31', 'Moonshot K3.1')], {
      'kimi-k3.1': 'moonshot-k31',
    });
    expect(r.matches.get('claude-fable-5.5')?.externalId).toBe('claude-fable-5-5');
    expect(r.matches.get('kimi-k3.1')?.externalId).toBe('moonshot-k31');
    expect(r.unmatchedModels).toEqual(['gpt-6.1-astra']);
  });
  it('never uses one record twice', () => {
    const r = matchModels([...ours, { id: 'dup', name: 'GPT-6.1 Astra', status: 'released' }], [ext('a', 'GPT-6.1 Astra')], {});
    expect([...r.matches.values()].length).toBe(1);
  });
  it('gives each creator a stable colour', () => {
    expect(colorFor('Mistral')).toBe(colorFor('Mistral'));
    expect(colorFor('Mistral')).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
