# Frontier Model Viz

A dashboard for comparing frontier AI models: one composite score across nine benchmarks, prices, speed,
release history and a changelog of every value that moved. Live numbers come from
[Artificial Analysis](https://artificialanalysis.ai/); everything else is a clearly labelled placeholder.

- **No database to install.** The data is five CSV files in [`data/`](data/). Open them in Excel or Sheets.
- **Two ways to run:** a local server with live refresh, or a static site on GitHub Pages refreshed daily by GitHub Actions.

## Quick start

Requires **Node.js 22.13+**.

```bash
npm install
npm run dev        # site on http://localhost:5173, API on :8787
```

That's it — no keys needed. Without an API key the site shows the placeholder data.

### Turn on live data

1. Get a free key at https://artificialanalysis.ai/ (Data API: 100 requests/day; a refresh uses 1–2).
2. Copy `.env.example` to `.env` and set `AA_API_KEY=…`.
3. Restart `npm run dev`. It refreshes on start and then every 24 h; open tabs update by themselves.

A free key provides the AA Intelligence Index, prices, output speed, latency and release dates. `AA_TIER=pro`
with a Pro key also fills GPQA Diamond and MMMU-Pro. If a model's name differs from Artificial Analysis',
link it with `AA_ALIASES=my-model-id=their-slug`, or type the slug into the `aa_slug` column of `data/models.csv`.

## The data (CSV "database")

| File                  | One row per                                            | You edit it?                          |
| --------------------- | ------------------------------------------------------ | ------------------------------------- |
| `data/models.csv`     | model: name, lab, release date, colour, prices, speed  | Yes — add a row to track a model      |
| `data/benchmarks.csv` | benchmark: scale (min/max), category, composite weight | Yes — weights must sum to 1           |
| `data/scores.csv`     | observation: model × benchmark × source × date         | Optional — mock rows are placeholders |
| `data/runs.csv`       | refresh: when, source, how many values changed         | No — written by refreshes             |
| `data/changes.csv`    | changed value: old → new                               | No — written by refreshes             |

Rules: dates as `2026-08-12`; leave a cell empty for "not evaluated". Live rows always beat mock rows, and the
newest date wins, so history is never overwritten. Run `npm run check:data` after editing; it catches typos,
duplicate ids, out-of-range scores and weights that don't add up. Close a file in Excel before a refresh writes to it.

## What's in the app

The site is written for people who have never heard of a benchmark. A **Simple / Detailed** switch in the top bar
(shortcut `D`) changes every page between plain words and the raw numbers, so experts lose nothing.

| Page            | What it does                                                                                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**        | Ask a question ("best for coding?", "best for the money?"); a 3D city of models rearranges itself and a one-line answer explains it. Then five short chapters: what a score means (dots out of 100), a typing race against a person, what real jobs cost, how many books fit in memory, and how fast the best score is rising |
| **Rankings**    | Simple: report-card grades (A+ to D) per skill with everyday costs and times. Detailed: every benchmark with gold/silver/bronze chips, price, speed, context. Sortable, filterable, shareable URL                                                                                                                             |
| **Models**      | Card directory with profile bars, filters and sorting                                                                                                                                                                                                                                                                         |
| **Compare**     | 2–4 models head to head, winner per benchmark, price/speed rows                                                                                                                                                                                                                                                               |
| **Model page**  | Simple: a report card — overall grade, one line per skill showing where it sits among all models, everyday costs, "good choice for / think twice for". Detailed: KPIs, rank per benchmark, rivals, score history                                                                                                              |
| **Explore**     | Radar, Bars, Heatmap, Cost vs score, Timeline                                                                                                                                                                                                                                                                                 |
| **Data & API**  | The CSV files (download), source status, refresh log, changelog, API reference                                                                                                                                                                                                                                                |
| **Methodology** | How scores are scaled, weighted and guarded                                                                                                                                                                                                                                                                                   |

Also: custom composite weights (`W`), search (`Ctrl/⌘ K`), number keys `1`–`9` for pages, `T` for light/dark,
`?` for all shortcuts. Every filter and sort lives in the URL.

**Why it looks like this.** The plain-language layer follows published research on explaining numbers to
non-experts: re-expressing figures in familiar units such as books, minutes and cents
([Barrio, Goldstein & Hofman, CHI 2016](https://doi.org/10.1145/2858036.2858510)); "X out of 100" dot grids for
proportions ([Galesic, Garcia-Retamero & Gigerenzer, 2009](https://doi.org/10.1037/a0014474)); and a guided
story first, free exploration after ([Segel & Heer, 2010](https://doi.org/10.1109/TVCG.2010.179)).

## Scripts

| Command                                  | Does                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                            | Local server (watches `server/`) + Vite dev server                       |
| `npm run ingest`                         | Pull live sources once and write `data/*.csv`                            |
| `npm run check:data`                     | Validate the CSV files                                                   |
| `npm run build` / `npm run build:static` | Type-check + build with live API / build the static (Pages) site         |
| `npm start`                              | Serve the built site and API from one process (`npm run build` first)    |
| `npm run lint` · `format` · `typecheck`  | ESLint · Prettier · TypeScript (web, server, tests)                      |
| `npm test` · `test:coverage`             | Unit + API tests (Vitest)                                                |
| `npm run test:e2e`                       | Playwright tests, desktop + phone (first run `npm run test:e2e:install`) |
| `npm run ci`                             | Everything CI runs, locally                                              |

## CI/CD on GitHub

Two workflows live in `.github/workflows/`:

- **CI** (`ci.yml`) — on every pull request and push: lint, formatting, types, data validation, unit tests with
  coverage, build, Playwright end-to-end tests on desktop and phone, and a dependency audit.
- **Deploy to GitHub Pages** (`pages.yml`) — on every push to `main`: test, build, deploy. Daily at 05:17 UTC
  (and on demand): pull live data, commit the updated CSV files, rebuild and redeploy.

Dependabot (`.github/dependabot.yml`) opens weekly update PRs — minor/patch grouped, majors one at a time —
so upgrades are tested by CI before they land instead of breaking `npm update`.

### One-time setup

1. Create a GitHub repository and push this folder to `main`:
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/frontier-model-viz.git
   git push -u origin main
   ```
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**: `AA_API_KEY` (optional; without it the
   site deploys with the CSV data as-is). Optional: `NOTIFY_WEBHOOK_URL` (Slack/Discord/Teams webhook pinged when data changes).
4. **Actions → Deploy to GitHub Pages → Run workflow** for the first deploy. The site appears at
   `https://<you>.github.io/frontier-model-viz/`.

## How it fits together

```
data/*.csv ─┬─ bundled into the static build ───────────────► GitHub Pages (daily)
            └─ read/written by the local server (Hono)
                 ├─ /api/* JSON, CSV downloads, OpenAPI spec
                 ├─ /api/events  (server-sent events → live UI updates)
                 └─ scheduler → sources/artificialAnalysis.ts → appends scores, logs changes, pings webhook
src/viz/<page>/   one folder per page, registered in src/viz/registry.ts (nav, route, shortcut, search)
src/lib/          CSV parser + dataset logic shared by browser and server
```

**Add a page:** create `src/viz/<name>/index.ts` + `Page.tsx` and add it to `registry.ts`.
**Add a data source:** implement `SourcePlugin` (`server/sources/types.ts`) and register it in
`server/sources/index.ts`; matching, history, changelog, scheduling and notifications are handled for you.

## Data & attribution

Live figures come from the [Artificial Analysis](https://artificialanalysis.ai/) Data API and are credited in the
site footer, as their terms require. All other benchmark values are placeholders (`source = mock`) until a source covers them.
