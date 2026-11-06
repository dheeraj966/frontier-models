import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';
import { currentScores, normDate, parseTables, serializeTable } from './dataset';

describe('csv', () => {
  it('round-trips quotes, commas, newlines and a BOM', () => {
    const rows = [
      { a: 'plain', b: 'has, comma' },
      { a: 'say "hi"', b: 'two\nlines' },
    ];
    const text = '\ufeff' + toCsv(rows, ['a', 'b']);
    expect(parseCsv(text)).toEqual(rows);
  });
  it('ignores blank lines and CRLF', () => {
    expect(parseCsv('x,y\r\n1,2\r\n\r\n3,4\r\n')).toEqual([
      { x: '1', y: '2' },
      { x: '3', y: '4' },
    ]);
  });
});

describe('dataset', () => {
  it('normalizes spreadsheet date formats', () => {
    expect(normDate('2026-08-12')).toBe('2026-08-12');
    expect(normDate('12/08/2026')).toBe('2026-08-12');
    expect(normDate('2026/8/2')).toBe('2026-08-02');
  });
  it('picks live over mock, newest over older', () => {
    const cur = currentScores([
      { modelId: 'm', benchmarkId: 'b', value: 1, source: 'mock', sourceId: 'mock', asOf: '2026-12-01' },
      { modelId: 'm', benchmarkId: 'b', value: 2, source: 'leaderboard', sourceId: 'x', asOf: '2026-01-01' },
      { modelId: 'm', benchmarkId: 'b', value: 3, source: 'leaderboard', sourceId: 'x', asOf: '2026-02-01' },
    ]);
    expect(cur).toHaveLength(1);
    expect(cur[0].value).toBe(3);
  });
  it('parses and re-serializes models without loss', () => {
    const text =
      'id,name,short_name,provider,family,status,baseline,release_date,color,context_window,input_price,output_price,output_tps,ttft_s,stats_source,stats_as_of,origin,aa_slug,notes\n' +
      'x,Model X,X,Lab,Fam,released,yes,2026-01-02,#112233,"1,000,000",$3,15,,,mock,,seed,,"note, with comma"\n';
    const t = parseTables({ models: text });
    expect(t.models[0]).toMatchObject({ baseline: true, contextWindow: 1_000_000, costPerMTokIn: 3, notes: 'note, with comma' });
    const again = parseTables({ models: serializeTable('models', t) });
    expect(again.models).toEqual(t.models);
  });
});
