import type { DataProvider, DatasetPayload, ScorePoint, ServerEvent } from '../types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) });
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new Error(`API unavailable (${res.status})`);
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

/** Talks to the Node API (server/). Live data, history, refresh and push updates. */
export const apiProvider: DataProvider = {
  id: 'api',
  label: 'Live API',
  isMock: false,
  load: () => getJson<DatasetPayload>('/api/dataset'),
  getHistory: (modelId) => getJson<ScorePoint[]>(`/api/models/${encodeURIComponent(modelId)}/history`),
  async refresh() {
    try {
      const r = await getJson<{ runs: { status: string; message?: string; sourceId: string }[] }>('/api/ingest', {
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
      });
      const bad = r.runs.find((x) => x.status !== 'ok');
      return bad
        ? { ok: false, message: bad.message ?? `${bad.sourceId}: ${bad.status}` }
        : { ok: true, message: r.runs.map((x) => x.message).join(' · ') };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  },
  subscribe(onEvent) {
    if (typeof EventSource === 'undefined') return () => {};
    const es = new EventSource(`${BASE}/api/events`);
    const handler = (ev: MessageEvent) => {
      try {
        onEvent(JSON.parse(ev.data) as ServerEvent);
      } catch {
        /* ignore malformed */
      }
    };
    for (const t of ['hello', 'ingest-started', 'ingest-finished']) es.addEventListener(t, handler as EventListener);
    return () => es.close();
  },
};
