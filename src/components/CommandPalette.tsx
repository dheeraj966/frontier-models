import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataset } from '../data/DatasetProvider';
import { usePreferences } from '../state/preferences';
import { vizPlugins } from '../viz/registry';
import { copyText, datasetToCsv, exportChartPng, exportCsv } from '../utils/export';
import Modal from './Modal';
import Icon from './Icon';
import { useToast } from './Toasts';

interface Item {
  id: string;
  group: 'Views' | 'Models' | 'Actions';
  label: string;
  hint?: string;
  icon?: string;
  color?: string;
  keywords?: string;
  run(): void;
}

/** Subsequence match score: consecutive + word-start hits rank higher. -1 = no match. */
function score(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  let s = 0,
    ti = 0,
    run = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, ti);
    if (i < 0) return -1;
    run = i === ti ? run + 1 : 0;
    s += 1 + run * 2 + (i === 0 || t[i - 1] === ' ' ? 3 : 0);
    ti = i + 1;
  }
  return s;
}

/** Ctrl/⌘ + K: jump to any view or model, or run an action. */
export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, toggleTheme, resolvedTheme, setWeightsOpen, setWeights, setHelpOpen } = usePreferences();
  const { models, benchmarks, scores, composites, refresh } = useDataset();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ('');
      setActive(0);
    }
  }, [paletteOpen]);

  const close = () => setPaletteOpen(false);
  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to);
    const views: Item[] = vizPlugins.map((p, i) => ({
      id: `v-${p.id}`,
      group: 'Views',
      label: p.title,
      hint: `${i + 1}`,
      icon: p.id,
      keywords: p.description,
      run: go(p.path),
    }));
    const ms: Item[] = [...models]
      .sort((a, b) => (composites.get(b.id) ?? -1) - (composites.get(a.id) ?? -1))
      .map((m) => ({
        id: `m-${m.id}`,
        group: 'Models',
        label: m.name,
        color: m.color,
        hint: composites.get(m.id) == null ? m.provider : `${m.provider} · ${composites.get(m.id)!.toFixed(1)}`,
        keywords: `${m.shortName} ${m.family} ${m.provider}`,
        run: go(`/model/${encodeURIComponent(m.id)}`),
      }));
    const actions: Item[] = [
      {
        id: 'a-theme',
        group: 'Actions',
        label: `Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`,
        hint: 'T',
        icon: resolvedTheme === 'dark' ? 'sun' : 'moon',
        run: toggleTheme,
      },
      {
        id: 'a-weights',
        group: 'Actions',
        label: 'Adjust composite weights',
        hint: 'W',
        icon: 'sliders',
        run: () => setWeightsOpen(true),
      },
      {
        id: 'a-reset',
        group: 'Actions',
        label: 'Reset weights to defaults',
        icon: 'sliders',
        run: () => {
          setWeights(null);
          toast.push({ title: 'Weights reset' });
        },
      },
      {
        id: 'a-link',
        group: 'Actions',
        label: 'Copy link to this view',
        icon: 'link',
        keywords: 'share url',
        run: async () =>
          toast.push({ tone: (await copyText(location.href)) ? 'success' : 'error', title: 'Link copied', body: location.href }),
      },
      {
        id: 'a-csv',
        group: 'Actions',
        label: 'Export data as CSV',
        icon: 'download',
        keywords: 'download spreadsheet excel',
        run: () =>
          exportCsv(
            `frontier-models-${new Date().toISOString().slice(0, 10)}.csv`,
            datasetToCsv(models, benchmarks, scores, composites),
          ),
      },
      {
        id: 'a-png',
        group: 'Actions',
        label: 'Export current chart as PNG',
        icon: 'image',
        keywords: 'download picture screenshot',
        run: async () => {
          if (!(await exportChartPng(document.querySelector('main'), `chart-${Date.now()}.png`)))
            toast.push({ tone: 'error', title: 'No chart on this page' });
        },
      },
      { id: 'a-help', group: 'Actions', label: 'Keyboard shortcuts', hint: '?', icon: 'keyboard', run: () => setHelpOpen(true) },
    ];
    if (refresh)
      actions.splice(2, 0, {
        id: 'a-refresh',
        group: 'Actions',
        label: 'Refresh live data now',
        icon: 'refresh',
        run: () => void refresh(),
      });
    return [...views, ...ms, ...actions];
  }, [
    models,
    benchmarks,
    scores,
    composites,
    navigate,
    resolvedTheme,
    toggleTheme,
    setWeightsOpen,
    setWeights,
    setHelpOpen,
    refresh,
    toast,
  ]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items
      .map((it) => ({ it, s: Math.max(score(query, it.label), score(query, it.keywords ?? '') - 5) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it)
      .slice(0, 30);
  }, [q, items]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runAt = (i: number) => {
    const it = results[i];
    if (!it) return;
    close();
    it.run();
  };

  let lastGroup = '';
  return (
    <Modal open={paletteOpen} onClose={close} label="Search and commands" className="palette">
      <div className="palette-input">
        <Icon name="search" />
        <input
          data-autofocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search models, views, actions…"
          aria-label="Search"
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              runAt(active);
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
        {results.length === 0 && <li className="palette-empty">No matches for “{q}”.</li>}
        {results.map((it, i) => {
          const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
          return (
            <li key={it.id} role="presentation">
              {head && <div className="palette-group">{head}</div>}
              <div
                id={`pal-${it.id}`}
                role="option"
                aria-selected={i === active}
                data-idx={i}
                className={`palette-item ${i === active ? 'is-active' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => runAt(i)}
              >
                {it.color ? (
                  <span className="dot" style={{ background: it.color }} />
                ) : (
                  <Icon name={it.icon ?? 'info'} size={15} />
                )}
                <span className="palette-label">{it.label}</span>
                {it.hint && <span className="palette-hint">{it.hint}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="palette-foot">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> move
        </span>
        <span>
          <kbd>↵</kbd> open
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </div>
    </Modal>
  );
}
