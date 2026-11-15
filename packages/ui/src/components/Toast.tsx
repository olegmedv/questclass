import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

export type ToastTone = 'info' | 'success' | 'error';

const icons: Record<ToastTone, ReactNode> = {
  info: <Info aria-hidden="true" />,
  success: <CircleCheck aria-hidden="true" />,
  error: <TriangleAlert aria-hidden="true" />,
};

export interface ToastProps {
  readonly tone?: ToastTone;
  readonly children: ReactNode;
  readonly onClose?: () => void;
  /** Optional action button, e.g. «Отменить». */
  readonly action?: { readonly label: string; readonly onClick: () => void };
}

/** One notification; errors are announced at once, the rest politely. */
export function Toast({ tone = 'info', children, onClose, action }: ToastProps) {
  return (
    <div className="qc-toast" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {icons[tone]}
      <span className="qc-toast-message">{children}</span>
      {action && (
        <button type="button" className="qc-toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onClose && (
        <button type="button" className="qc-toast-close" aria-label="Скрыть" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export interface ToastOptions {
  readonly tone?: ToastTone;
  /** Milliseconds before it hides; errors stay twice as long. */
  readonly durationMs?: number;
  readonly action?: ToastProps['action'];
}

interface ToastEntry extends ToastOptions {
  readonly id: number;
  readonly message: ReactNode;
}

interface ToastApi {
  show(message: ReactNode, options?: ToastOptions): number;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION_MS = 4000;

/** Keeps the queue of notifications; at most three are visible, newest at the bottom. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: ReactNode, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, ...options }]);
      const base = options.durationMs ?? DEFAULT_DURATION_MS;
      const duration = options.tone === 'error' ? base * 2 : base;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="qc-toast-region">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              tone={toast.tone}
              action={toast.action}
              onClose={() => dismiss(toast.id)}
            >
              {toast.message}
            </Toast>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast() needs a <ToastProvider> above it');
  return api;
}
