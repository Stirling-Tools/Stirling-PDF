import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "@shared/components/Toast.css";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastOptions {
  tone?: ToastTone;
  title?: ReactNode;
  description?: ReactNode;
  /** Auto-dismiss timeout in ms. Defaults to 4000. Pass 0 to keep open. */
  durationMs?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextIdRef.current++;
      const entry: ToastEntry = {
        tone: "info",
        durationMs: 4000,
        ...options,
        id,
      };
      setEntries((prev) => [...prev, entry]);
      if ((entry.durationMs ?? 0) > 0) {
        window.setTimeout(() => dismiss(id), entry.durationMs);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport entries={entries} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  entries,
  onDismiss,
}: {
  entries: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  // Render through a portal so toasts always sit above any in-flow stacking
  // context. SSR-safe by checking for document existence.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="sui-toast-viewport"
      role="region"
      aria-label="Notifications"
    >
      {entries.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    // Allow Escape to dismiss the most recently focused toast.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss(entry.id);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [entry.id, onDismiss]);

  return (
    <div
      role="alert"
      className={`sui-toast sui-toast--${entry.tone ?? "info"}`}
    >
      <div className="sui-toast__body">
        {entry.title && <div className="sui-toast__title">{entry.title}</div>}
        {entry.description && (
          <div className="sui-toast__desc">{entry.description}</div>
        )}
      </div>
      <button
        type="button"
        className="sui-toast__close"
        onClick={() => onDismiss(entry.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
