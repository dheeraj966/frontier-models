import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
}
interface ToastApi {
  push(t: { title: string; body?: string; tone?: Tone; ttl?: number }): void;
}

const Ctx = createContext<ToastApi>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback<ToastApi['push']>(
    ({ title, body, tone = 'info', ttl = 5000 }) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, title, body, tone }]);
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
            </div>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
