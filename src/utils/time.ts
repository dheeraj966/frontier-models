const rtf =
  typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

export function timeAgo(iso?: string, now = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  const [v, u]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 60
      ? [s, 'second']
      : abs < 3600
        ? [Math.round(s / 60), 'minute']
        : abs < 86400
          ? [Math.round(s / 3600), 'hour']
          : [Math.round(s / 86400), 'day'];
  return rtf ? rtf.format(v, u) : new Date(t).toLocaleString();
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const toDay = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** Compact age: "45s", "12m", "3h", "2d". */
export function shortAgo(iso?: string, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (Number.isNaN(s)) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
