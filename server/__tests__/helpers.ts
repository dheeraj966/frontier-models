import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, type Config } from '../config';
import type { AppContext } from '../context';
import { EventBus } from '../events';
import { sources } from '../sources';
import { CsvStore } from '../store';

export const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const DATA = fileURLToPath(new URL('../../data', import.meta.url));

/** A throwaway copy of /data + config + a fetch stub that serves the AA fixture. */
export function makeCtx(
  over: Partial<Config> = {},
  body = fixture('aa-free.json'),
  status = 200,
): AppContext & { calls: string[]; posts: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'fmv-'));
  cpSync(DATA, dir, { recursive: true });
  const calls: string[] = [];
  const posts: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(String(init.body));
      return new Response('ok');
    }
    calls.push(String(url));
    const key = new Headers(init?.headers).get('x-api-key');
    if (key !== 'k') return new Response('{}', { status: 401 });
    return new Response(body, { status, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '42' } });
  }) as typeof fetch;
  const cfg: Config = { ...loadConfig({}, []), dataDir: dir, aaApiKey: 'k', ...over };
  return { store: new CsvStore(dir), cfg, bus: new EventBus(), sources, fetchImpl, calls, posts };
}
