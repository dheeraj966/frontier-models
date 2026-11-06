/** OpenAPI 3.1 description of the local API (served at /api/openapi.json, listed on the Data page). */
const json = (description: string, schema: object = { type: 'object' }) => ({
  description,
  content: { 'application/json': { schema } },
});

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Frontier Model Viz API',
    version: '0.3.0',
    description: 'Read-only access to models, benchmarks and scores stored in the CSV files under /data, plus a refresh trigger.',
  },
  servers: [{ url: 'http://localhost:8787' }],
  paths: {
    '/api/dataset': {
      get: {
        summary: 'Everything the UI needs: models, benchmarks, current scores, runs, changes, file stats',
        responses: { 200: json('Dataset payload'), 304: { description: 'Not modified (ETag)' } },
      },
    },
    '/api/models': { get: { summary: 'All models', responses: { 200: json('Model list', { type: 'array' }) } } },
    '/api/models/{id}': {
      get: {
        summary: 'One model with current scores and full history',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json('Model detail'), 404: json('Unknown model') },
      },
    },
    '/api/models/{id}/history': {
      get: {
        summary: 'Every recorded observation for one model',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json('Score points', { type: 'array' }) },
      },
    },
    '/api/benchmarks': {
      get: { summary: 'Benchmark definitions and composite weights', responses: { 200: json('Benchmarks', { type: 'array' }) } },
    },
    '/api/scores': {
      get: {
        summary: 'Current value per model × benchmark (live beats mock, newest wins)',
        responses: { 200: json('Scores', { type: 'array' }) },
      },
    },
    '/api/sources': {
      get: { summary: 'Configured live-data sources and their last run', responses: { 200: json('Sources', { type: 'array' }) } },
    },
    '/api/runs': {
      get: {
        summary: 'Ingest run log, newest first',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200 } }],
        responses: { 200: json('Runs', { type: 'array' }) },
      },
    },
    '/api/changes': {
      get: {
        summary: 'Value changelog, newest first',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 1000 } }],
        responses: { 200: json('Changes', { type: 'array' }) },
      },
    },
    '/api/files': {
      get: {
        summary: 'The CSV files with row counts, sizes and modification times',
        responses: { 200: json('Files', { type: 'array' }) },
      },
    },
    '/api/files/{name}': {
      get: {
        summary: 'Download one CSV file',
        parameters: [
          {
            name: 'name',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['models.csv', 'benchmarks.csv', 'scores.csv', 'runs.csv', 'changes.csv'] },
          },
        ],
        responses: { 200: { description: 'CSV', content: { 'text/csv': {} } } },
      },
    },
    '/api/export.csv': {
      get: {
        summary: 'Wide CSV: one row per model with every benchmark and the composite',
        responses: { 200: { description: 'CSV', content: { 'text/csv': {} } } },
      },
    },
    '/api/ingest': {
      post: {
        summary: 'Refresh from live sources now (localhost, or Bearer ADMIN_TOKEN)',
        responses: { 200: json('Runs'), 401: json('Bad token'), 403: json('Not local'), 429: json('Cooldown') },
      },
    },
    '/api/events': {
      get: {
        summary: 'Server-sent events: hello, ingest-started, ingest-finished',
        responses: { 200: { description: 'text/event-stream' } },
      },
    },
    '/api/health': { get: { summary: 'Liveness probe', responses: { 200: json('OK') } } },
  },
} as const;
