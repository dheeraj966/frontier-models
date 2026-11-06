import { useMemo, useState } from 'react';
import { useDataset } from '../../data/DatasetProvider';
import { bundledRaw } from '../../data/providers/staticProvider';
import type { TableName } from '../../lib/dataset';
import { copyText, download } from '../../utils/export';
import { timeAgo } from '../../utils/time';
import { Card, EmptyState, ModelAvatar, PageHeader, Segmented } from '../../components/ui';
import { useToast } from '../../components/Toasts';
import Icon from '../../components/Icon';

const FILE_INFO: Record<string, { what: string; icon: string }> = {
  'models.csv': {
    what: 'One row per model — name, lab, release date, colour, prices, speed. Add a row to track a new model.',
    icon: 'grid',
  },
  'benchmarks.csv': { what: 'Benchmark definitions, scale (min/max) and composite weight.', icon: 'flask' },
  'scores.csv': {
    what: 'Every observation: model × benchmark × source × date. Mock rows are placeholders; live rows win.',
    icon: 'chart',
  },
  'runs.csv': { what: 'Log of every refresh: when, which source, how many values changed.', icon: 'refresh' },
  'changes.csv': { what: 'Changelog of each value that moved, with old and new value.', icon: 'layers' },
};

const ENDPOINTS: [string, string, string][] = [
  ['GET', '/api/dataset', 'Everything the UI uses in one call (ETag-cached)'],
  ['GET', '/api/models/:id', 'One model with current scores and full history'],
  ['GET', '/api/scores', 'Current value per model × benchmark'],
  ['GET', '/api/runs', 'Refresh log, newest first'],
  ['GET', '/api/changes', 'Value changelog, newest first'],
  ['GET', '/api/files/:name', 'Download one CSV file'],
  ['GET', '/api/export.csv', 'Wide CSV with composite'],
  ['GET', '/api/events', 'Server-sent events for live updates'],
  ['POST', '/api/ingest', 'Refresh now (localhost or Bearer token)'],
  ['GET', '/api/openapi.json', 'OpenAPI 3.1 spec'],
];

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const FIELD_LABEL: Record<string, string> = {
  input_price: 'Input price',
  output_price: 'Output price',
  output_tps: 'Output speed',
  ttft_s: 'First token',
};

export default function DataPage() {
  const { files, meta, runs, changes, providerId, refresh, refreshing, models, benchmarks, scores } = useDataset();
  const toast = useToast();
  const [tab, setTab] = useState<'changes' | 'runs'>('changes');
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const benchById = useMemo(() => new Map(benchmarks.map((b) => [b.id, b])), [benchmarks]);
  const live = scores.filter((s) => s.source !== 'mock').length;
  const isApi = providerId === 'api';

  const fetchFile = (name: string) => {
    if (isApi) {
      window.location.href = `${(import.meta.env.VITE_API_BASE as string | undefined) ?? ''}/api/files/${name}`;
      return;
    }
    const raw = bundledRaw[name.replace('.csv', '') as TableName] ?? '';
    download(name, new Blob(['﻿', raw], { type: 'text/csv;charset=utf-8' }));
  };

  return (
    <section>
      <PageHeader
        eyebrow="Data & API"
        title="Plain files, fully traceable"
        description="No database to install: the data lives in five CSV files in the project's data folder. Open them in Excel or Sheets, edit, save — the site picks the change up. Every live refresh appends rows, so history and a changelog come for free."
        actions={
          refresh ? (
            <button type="button" className="btn btn-primary" disabled={refreshing} onClick={() => void refresh()}>
              <Icon name="refresh" size={14} /> {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          ) : undefined
        }
      />

      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Served by</span>
          <span className="kpi-value">{isApi ? 'Local API' : 'Static build'}</span>
          <span className="kpi-sub">{isApi ? 'npm run dev · reads /data live' : 'CSV bundled at build time'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Score rows</span>
          <span className="kpi-value">
            {(files.find((f) => f.name === 'scores.csv')?.rows ?? scores.length).toLocaleString()}
          </span>
          <span className="kpi-sub">{live} live current values</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Refreshes</span>
          <span className="kpi-value">{runs.length}</span>
          <span className="kpi-sub">{runs[0] ? `last ${timeAgo(runs[0].finishedAt ?? runs[0].startedAt)}` : 'none yet'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Changes logged</span>
          <span className="kpi-value">{changes.length}</span>
          <span className="kpi-sub">values that moved</span>
        </div>
      </div>

      <div className="grid-2 data-top">
        <Card title="Files" marker="#8b7cf6" subtitle="The data folder — this is the whole database">
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.name}>
                <span className="file-icon">
                  <Icon name={FILE_INFO[f.name]?.icon ?? 'file'} size={15} />
                </span>
                <span className="file-text">
                  <span className="file-name mono">data/{f.name}</span>
                  <span className="file-what">{FILE_INFO[f.name]?.what}</span>
                </span>
                <span className="file-meta mono">
                  {f.rows.toLocaleString()} rows · {kb(f.bytes)}
                  {f.updatedAt ? ` · ${timeAgo(f.updatedAt)}` : ''}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => fetchFile(f.name)}
                  title={`Download ${f.name}`}
                  aria-label={`Download ${f.name}`}
                >
                  <Icon name="download" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Sources" marker="#34d399" subtitle="Where live numbers come from">
          {(meta?.sources ?? []).map((s) => (
            <div key={s.id} className="source-card">
              <div className="source-head">
                <span
                  className={`status-dot ${s.configured ? (s.lastRun?.status === 'error' ? 'is-error' : 'is-live') : 'is-off'}`}
                />
                <a href={s.attribution?.url} target="_blank" rel="noreferrer" className="source-name">
                  {s.label} <Icon name="external" size={12} />
                </a>
                <span className="source-when">
                  {s.lastRun
                    ? `${s.lastRun.status} · ${timeAgo(s.lastRun.finishedAt ?? s.lastRun.startedAt)}`
                    : s.configured
                      ? 'not run yet'
                      : 'not connected'}
                </span>
              </div>
              <div className="tag-row">
                {s.provides.map((p) => (
                  <span key={p} className="tag">
                    {p}
                  </span>
                ))}
              </div>
              {s.lastRun?.message && <p className="source-msg">{s.lastRun.message}</p>}
              {!s.configured && (
                <ol className="steps">
                  <li>
                    Get a free key at{' '}
                    <a href="https://artificialanalysis.ai/" target="_blank" rel="noreferrer">
                      artificialanalysis.ai
                    </a>{' '}
                    (Data API, 100 requests/day).
                  </li>
                  <li>
                    Locally: put <code>AA_API_KEY=…</code> in <code>.env</code> and run <code>npm run dev</code>.
                  </li>
                  <li>
                    On GitHub: add a repository secret <code>AA_API_KEY</code>; the daily workflow refreshes and redeploys.
                  </li>
                </ol>
              )}
            </div>
          ))}
          <div className="pipeline" aria-label="Automation pipeline">
            {[
              ['clock', 'Daily 05:17 UTC'],
              ['refresh', 'npm run ingest'],
              ['file', 'Commit data/*.csv'],
              ['check', 'Test & build'],
              ['rocket', 'Deploy Pages'],
            ].map(([ic, label], i, arr) => (
              <span key={label} className="pipe-step">
                <span className="pipe-node">
                  <Icon name={ic} size={13} />
                </span>
                <span className="pipe-label">{label}</span>
                {i < arr.length - 1 && <span className="pipe-edge" aria-hidden="true" />}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="History"
        marker="#22d3ee"
        subtitle="Every refresh and every value that moved"
        action={
          <Segmented<'changes' | 'runs'>
            label="History view"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'changes', label: `Changes (${changes.length})` },
              { value: 'runs', label: `Refreshes (${runs.length})` },
            ]}
          />
        }
      >
        {tab === 'changes' ? (
          changes.length === 0 ? (
            <EmptyState icon="layers" title="No changes yet">
              They appear here after the first live refresh.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Model</th>
                    <th>Field</th>
                    <th className="num">Old</th>
                    <th className="num">New</th>
                    <th className="num">Δ</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.slice(0, 100).map((c, i) => {
                    const m = modelById.get(c.modelId);
                    const d = c.oldValue !== null && c.newValue !== null ? c.newValue - c.oldValue : null;
                    return (
                      <tr key={`${c.at}-${i}`}>
                        <td className="muted nowrap">{timeAgo(c.at)}</td>
                        <td>
                          {m ? (
                            <span className="inline-model">
                              <ModelAvatar model={m} size={18} />
                              {m.shortName}
                            </span>
                          ) : (
                            c.modelId
                          )}
                        </td>
                        <td>{benchById.get(c.field)?.shortName ?? FIELD_LABEL[c.field] ?? c.field}</td>
                        <td className="num mono muted">{c.oldValue ?? '—'}</td>
                        <td className="num mono">{c.newValue ?? '—'}</td>
                        <td className={`num mono ${d === null ? '' : d >= 0 ? 'pos' : 'neg'}`}>
                          {d === null ? 'new' : `${d >= 0 ? '+' : ''}${+d.toFixed(3)}`}
                        </td>
                        <td className="muted">{c.sourceId}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : runs.length === 0 ? (
          <EmptyState icon="refresh" title="No refreshes yet" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>When</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th className="num">Matched</th>
                  <th className="num">Changed</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono muted">{r.id}</td>
                    <td className="nowrap">{timeAgo(r.finishedAt ?? r.startedAt)}</td>
                    <td className="muted">{r.trigger}</td>
                    <td>
                      <span className={`status-tag st-${r.status}`}>{r.status}</span>
                    </td>
                    <td className="num mono">{r.matched}</td>
                    <td className="num mono">{r.changed}</td>
                    <td className="muted run-msg">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="API"
        marker="#f59e0b"
        subtitle={
          isApi
            ? 'Running locally — try these in a browser or with curl'
            : 'Available when you run the local server (npm run dev)'
        }
        action={
          isApi ? (
            <a className="card-link" href="/api/openapi.json" target="_blank" rel="noreferrer">
              OpenAPI spec <Icon name="external" size={12} />
            </a>
          ) : undefined
        }
      >
        <ul className="endpoint-list">
          {ENDPOINTS.map(([method, path, what]) => (
            <li key={path}>
              <span className={`method m-${method.toLowerCase()}`}>{method}</span>
              <code className="endpoint-path">{path}</code>
              <span className="endpoint-what">{what}</span>
              <button
                type="button"
                className="icon-btn ghost"
                aria-label={`Copy curl for ${path}`}
                title="Copy curl"
                onClick={async () =>
                  toast.push({
                    tone: (await copyText(
                      `curl ${method === 'POST' ? '-X POST ' : ''}http://localhost:8787${path.replace(':id', models[0]?.id ?? 'id').replace(':name', 'models.csv')}`,
                    ))
                      ? 'success'
                      : 'error',
                    title: 'curl copied',
                  })
                }
              >
                <Icon name="copy" size={13} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
