import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { vizPlugins } from '../viz/registry';
import type { VizPlugin } from '../viz/types';
import { useDataset } from '../data/DatasetProvider';
import { usePreferences } from '../state/preferences';
import { useHotkeys } from '../hooks/useHotkeys';
import ErrorBoundary from './ErrorBoundary';
import Icon from './Icon';
import Modal from './Modal';
import CommandPalette from './CommandPalette';
import WeightsDrawer from './WeightsDrawer';
import ShortcutsHelp, { MOD } from './ShortcutsHelp';

export function PageSkeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      <div className="sk sk-eyebrow" />
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk-row">
        <div className="sk sk-card" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
      </div>
      <div className="sk sk-panel" />
    </div>
  );
}

const MAIN = vizPlugins.filter((p) => p.group === 'main');
const EXPLORE = vizPlugins.filter((p) => p.group === 'explore');
const DATA = vizPlugins.filter((p) => p.group === 'data');

/** Dropdown for a group of pages. Closes on outside click, Escape and navigation. */
function NavMenu({ label, items }: { label: string; items: VizPlugin[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const active = items.some((p) => pathname.startsWith(p.path));
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="nav-menu" ref={ref}>
      <button
        type="button"
        className={`nav-menu-btn${active ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => items.forEach((p) => void p.preload?.())}
      >
        {label} <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {items.map((p) => (
            <NavLink key={p.id} to={p.path} role="menuitem" className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>
              <span className="menu-icon">
                <Icon name={p.icon} size={16} />
              </span>
              <span className="menu-text">
                <b>{p.title}</b>
                <span>{p.description}</span>
              </span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { loading, error, isMock, liveValueCount, providerId, scores, customWeights, models, refreshing } = useDataset();
  const prefs = usePreferences();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const aaUsed =
    scores.some((s) => s.sourceId === 'artificial-analysis') || models.some((m) => m.statsSource && m.statsSource !== 'mock');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    prefs.setNavOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const anyOpen = prefs.paletteOpen || prefs.weightsOpen || prefs.helpOpen || prefs.navOpen;
  useHotkeys(
    {
      'mod+k': () => prefs.setPaletteOpen(!prefs.paletteOpen),
      '/': () => prefs.setPaletteOpen(true),
      w: () => prefs.setWeightsOpen(true),
      t: () => prefs.toggleTheme(),
      d: () => prefs.setDepth(prefs.depth === 'simple' ? 'detailed' : 'simple'),
      '?': () => prefs.setHelpOpen(true),
      ...Object.fromEntries(vizPlugins.slice(0, 9).map((p, i) => [String(i + 1), () => navigate({ pathname: p.path })])),
    },
    !anyOpen,
  );

  const pip = refreshing ? 'is-live' : isMock ? 'is-mock' : providerId === 'api' ? 'is-live' : 'is-static';

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="topnav">
        <nav className="capsule" aria-label="Main">
          <Link to="/" className="brand" aria-label="Frontier — home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 16 10 10 14 14 20 8" />
              </svg>
            </span>
            <span className="brand-name">Frontier</span>
          </Link>
          <span className="nav-links">
            {MAIN.map((p) => (
              <NavLink
                key={p.id}
                to={p.path}
                end={p.path === '/'}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onMouseEnter={() => void p.preload?.()}
                title={p.description}
              >
                {p.title}
              </NavLink>
            ))}
            <NavMenu label="Explore" items={EXPLORE} />
            <NavMenu label="Data" items={DATA} />
          </span>
        </nav>

        <div className="capsule tools">
          <div className="depth-dial" role="group" aria-label="Level of detail" title="Level of detail (D)">
            <button type="button" aria-pressed={prefs.depth === 'simple'} onClick={() => prefs.setDepth('simple')}>
              <Icon name="sparkles" size={13} />
              <span>Simple</span>
            </button>
            <button type="button" aria-pressed={prefs.depth === 'detailed'} onClick={() => prefs.setDepth('detailed')}>
              <Icon name="layers" size={13} />
              <span>Detailed</span>
            </button>
          </div>
          <button
            type="button"
            className="tool-btn"
            onClick={() => prefs.setPaletteOpen(true)}
            title={`Search (${MOD}+K)`}
            aria-label="Search"
          >
            <Icon name="search" size={16} />
          </button>
          <button
            type="button"
            className={`tool-btn${customWeights ? ' has-badge' : ''}`}
            onClick={() => prefs.setWeightsOpen(true)}
            title={customWeights ? 'Custom weights active (W)' : 'Composite weights (W)'}
            aria-label="Composite weights"
          >
            <Icon name="sliders" size={16} />
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={prefs.toggleTheme}
            title="Light / dark (T)"
            aria-label={`Switch to ${prefs.resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <Icon name={prefs.resolvedTheme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          <Link
            to="/data"
            className="tool-btn"
            title={isMock ? 'Placeholder data — connect a live source' : 'Data sources'}
            aria-label="Data status"
          >
            <span className={`live-pip ${pip}`} />
          </Link>
        </div>
      </header>

      <div className="banners">
        {!loading && !error && isMock && (
          <div className="banner banner-warn" role="note">
            <Icon name="warn" size={15} />
            <span>
              <strong>Example data.</strong> These numbers are placeholders until a live source is connected.{' '}
              <Link to="/data">How to connect →</Link>
            </span>
          </div>
        )}
        {!loading && !error && !isMock && scores.some((s) => s.source === 'mock') && (
          <div className="banner banner-info" role="note">
            <Icon name="layers" size={15} />
            <span>
              <strong>Partly live.</strong> {liveValueCount} values come from Artificial Analysis; the rest are placeholders
              (marked <span className="live-dot" aria-label="green dot" /> when live).
            </span>
          </div>
        )}
        {customWeights && !loading && (
          <div className="banner banner-violet" role="note">
            <Icon name="sliders" size={15} />
            <span>
              <strong>Custom weights.</strong> Overall scores use your weights.
            </span>
            <button type="button" className="link-btn" onClick={() => prefs.setWeightsOpen(true)}>
              Edit
            </button>
            <button type="button" className="link-btn" onClick={() => prefs.setWeights(null)}>
              Reset
            </button>
          </div>
        )}
      </div>

      <main id="main-content" tabIndex={-1}>
        {loading ? (
          <PageSkeleton />
        ) : error ? (
          <div className="error-box" role="alert">
            <h2>Dataset failed to load</h2>
            <p>{error}</p>
            <p className="footnote">
              Provider: <code>{providerId}</code>. Check the files in <code>/data</code> and reload.
            </p>
          </div>
        ) : (
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <div className="page" data-depth={prefs.depth}>
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      <footer className="site-footer">
        <span>Frontier · plain-English AI model comparisons</span>
        <span className="footer-links">
          <Link to="/methodology">How we score</Link>
          <Link to="/data">Data &amp; API</Link>
          {aaUsed && (
            <a href="https://artificialanalysis.ai/" target="_blank" rel="noreferrer">
              Live data: Artificial Analysis
            </a>
          )}
          <button type="button" className="link-btn" onClick={() => prefs.setHelpOpen(true)}>
            <kbd>?</kbd> Shortcuts
          </button>
        </span>
      </footer>

      {/* Phone: floating dock + "More" sheet */}
      <nav className="capsule dock" aria-label="Quick navigation">
        {MAIN.map((p) => (
          <NavLink key={p.id} to={p.path} end={p.path === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={p.icon} size={18} />
            {p.title}
          </NavLink>
        ))}
        <button type="button" onClick={() => prefs.setNavOpen(true)} aria-label="Open navigation">
          <Icon name="menu" size={18} />
          More
        </button>
      </nav>
      <Modal open={prefs.navOpen} onClose={() => prefs.setNavOpen(false)} label="All pages" className="help more-sheet">
        <div className="sheet-head">
          <h2>All pages</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => prefs.setNavOpen(false)}>
            <Icon name="x" />
          </button>
        </div>
        <div className="kbd-list">
          {[...MAIN, ...EXPLORE, ...DATA].map((p) => (
            <NavLink
              key={p.id}
              to={p.path}
              end={p.path === '/'}
              className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}
              onClick={() => prefs.setNavOpen(false)}
            >
              <span className="menu-icon">
                <Icon name={p.icon} size={16} />
              </span>
              <span className="menu-text">
                <b>{p.title}</b>
                <span>{p.description}</span>
              </span>
            </NavLink>
          ))}
        </div>
      </Modal>

      {!loading && !error && (
        <>
          <CommandPalette />
          <WeightsDrawer />
          <ShortcutsHelp />
        </>
      )}
    </div>
  );
}
