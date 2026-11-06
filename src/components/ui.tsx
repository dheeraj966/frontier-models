import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Model } from '../data/types';
import { initials, isNew } from '../utils/insights';
import Icon from './Icon';

/** Page title block: eyebrow, editorial serif title, description, right-aligned actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display">{title}</h1>
        {description && <p className="lede">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

/** Surface with an optional header (coloured square marker like an index card). */
export function Card({
  title,
  subtitle,
  marker,
  action,
  className = '',
  children,
  bodyClass = '',
  id,
  style,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  marker?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  bodyClass?: string;
  id?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={`card ${className}`} id={id} style={style}>
      {(title || action) && (
        <div className="card-head">
          <div className="card-head-text">
            {title && (
              <h2 className="card-title">
                {marker && <span className="card-marker" style={{ background: marker }} aria-hidden="true" />}
                {title}
              </h2>
            )}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function CardLink({ to, children = 'View all' }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="card-link">
      {children} <Icon name="chevronRight" size={14} />
    </Link>
  );
}

/** Provider monogram tinted with the model colour (no third-party logos). */
export function ModelAvatar({ model, size = 28 }: { model: Pick<Model, 'provider' | 'color' | 'name'>; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), ['--c' as string]: model.color }}
      title={model.provider}
      aria-hidden="true"
    >
      {initials(model.provider)}
    </span>
  );
}

/** Avatar + name + provider line, optionally linking to the model page. */
export function ModelCell({
  model,
  link = true,
  sub,
  size = 28,
}: {
  model: Model;
  link?: boolean;
  sub?: ReactNode;
  size?: number;
}) {
  const name = link ? (
    <Link to={`/model/${encodeURIComponent(model.id)}`} className="model-name" onClick={(e) => e.stopPropagation()}>
      {model.name}
    </Link>
  ) : (
    <span className="model-name">{model.name}</span>
  );
  return (
    <span className="model-cell">
      <ModelAvatar model={model} size={size} />
      <span className="model-cell-text">
        <span className="model-cell-top">
          {name}
          <ModelBadges model={model} />
        </span>
        <span className="model-cell-sub">{sub ?? model.provider}</span>
      </span>
    </span>
  );
}

export function ModelBadges({ model }: { model: Model }) {
  return (
    <>
      {isNew(model) && <span className="badge badge-new">NEW</span>}
      {model.status === 'expected' && <span className="badge badge-proj">PROJ</span>}
      {model.baseline && <span className="badge badge-base">BASE</span>}
      {model.origin === 'import' && <span className="badge badge-live">LIVE</span>}
    </>
  );
}

/** Mono number on a tint that encodes rank in its column: gold / silver / bronze / neutral. */
export function ScoreChip({
  value,
  rank,
  live,
  title,
  children,
}: {
  value: number | null;
  rank?: number;
  live?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  if (value === null)
    return (
      <span className="score-chip is-empty" title={title}>
        —
      </span>
    );
  const tier = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
  return (
    <span className={`score-chip ${tier}${live ? ' is-live' : ''}`} title={title}>
      {children ?? value.toFixed(1)}
    </span>
  );
}

export function Medal({ rank }: { rank: number }) {
  if (rank > 3) return <span className="rank-num">{rank}</span>;
  return <span className={`medal medal-${rank}`}>{rank}</span>;
}

/** Thin horizontal meter. */
export function Meter({
  value,
  max = 100,
  color,
  className = '',
}: {
  value: number | null;
  max?: number;
  color?: string;
  className?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className={`meter ${className}`} aria-hidden="true">
      <span className="meter-fill" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

/** Tiny bar sparkline (values 0–100). */
export function MiniBars({ values, color }: { values: (number | null)[]; color: string }) {
  const lo = Math.min(...values.filter((v): v is number => v !== null), 100);
  const floor = Math.max(0, Math.floor((lo - 10) / 10) * 10);
  return (
    <span className="minibars" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="minibar"
          style={{
            height: v === null ? '8%' : `${Math.max(8, ((v - floor) / (100 - floor)) * 100)}%`,
            background: v === null ? undefined : color,
            opacity: v === null ? 0.25 : 0.85,
          }}
        />
      ))}
    </span>
  );
}

export function Stat({ label, value, sub, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">
        {icon && <Icon name={icon} size={13} />}
        {label}
      </span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function EmptyState({ icon = 'info', title, children }: { icon?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <p className="empty-title">{title}</p>
        {children && <div className="empty-body">{children}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; icon?: string }[];
  onChange(v: T): void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange(v: string): void;
  placeholder?: string;
}) {
  return (
    <label className="search-input">
      <Icon name="search" size={14} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => onChange('')}>
          <Icon name="x" size={12} />
        </button>
      )}
    </label>
  );
}
