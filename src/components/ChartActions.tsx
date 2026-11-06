import type { RefObject } from 'react';
import Icon from './Icon';
import { useToast } from './Toasts';
import { exportChartPng } from '../utils/export';

/** Small "PNG" button for a chart panel. */
export default function ChartActions({ target, name }: { target: RefObject<HTMLElement>; name: string }) {
  const toast = useToast();
  return (
    <div className="panel-actions">
      <button
        type="button"
        className="icon-btn"
        title="Download chart as PNG"
        aria-label="Download chart as PNG"
        onClick={async () => {
          const ok = await exportChartPng(target.current, `${name}-${new Date().toISOString().slice(0, 10)}.png`);
          if (!ok) toast.push({ tone: 'error', title: 'Nothing to export', body: 'This view has no chart drawn yet.' });
        }}
      >
        <Icon name="image" size={15} />
      </button>
    </div>
  );
}
