import React, { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { ToastApi, ToastInstance, ToastOptions } from '@app/components/toast/types';

function normalizeProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  // Accept 0..1 as fraction or 0..100 as percent
  if (value <= 1) return Math.max(0, Math.min(1, value)) * 100;
  return Math.max(0, Math.min(100, value));
}

function generateId() {
  return `toast_${Math.random().toString(36).slice(2, 9)}`;
}

type DefaultOpts = Required<Pick<ToastOptions, 'alertType' | 'title' | 'isPersistentPopup' | 'location' | 'durationMs'>> &
  Partial<Omit<ToastOptions, 'id' | 'alertType' | 'title' | 'isPersistentPopup' | 'location' | 'durationMs'>>;

const defaultOptions: DefaultOpts = {
  alertType: 'neutral',
  title: '',
  isPersistentPopup: false,
  location: 'bottom-right',
  durationMs: 6000,
};

interface ToastContextShape extends ToastApi {
  toasts: ToastInstance[];
}

const ToastContext = createContext<ToastContextShape | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastInstance[]>([]);
  const timers = useRef<Record<string, number>>({});

  const scheduleAutoDismiss = useCallback((toast: ToastInstance) => {
    if (toast.isPersistentPopup) return;
    window.clearTimeout(timers.current[toast.id]);
    timers.current[toast.id] = window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, toast.durationMs);
  }, []);

  const show = useCallback<ToastApi['show']>((options) => {
    const id = options.id || generateId();
    const hasButton = !!(options.buttonText && options.buttonCallback);
    const merged: ToastInstance = {
      ...defaultOptions,
      ...options,
      id,
      progress: normalizeProgress(options.progressBarPercentage),
      justCompleted: false,
      expandable: hasButton ? false : (options.expandable !== false),
      isExpanded: hasButton ? true : (options.expandable === false ? true : (options.alertType === 'error' ? true : false)),
      createdAt: Date.now(),
    } as ToastInstance;
    setToasts(prev => {
      // Coalesce duplicates by alertType + title + body text if no explicit id was provided
      if (!options.id) {
        const bodyText = typeof merged.body === 'string' ? merged.body : '';
        const existingIndex = prev.findIndex(t => t.alertType === merged.alertType && t.title === merged.title && (typeof t.body === 'string' ? t.body : '') === bodyText);
        if (existingIndex !== -1) {
          const updated = [...prev];
          const existing = updated[existingIndex];
          const nextCount = (existing.count ?? 1) + 1;
          updated[existingIndex] = { ...existing, count: nextCount, createdAt: Date.now() };
          return updated;
        }
      }
      const next = [...prev.filter(t => t.id !== id), merged];
      return next;
    });
    scheduleAutoDismiss(merged);
    return id;
  }, [scheduleAutoDismiss]);

  const update = useCallback<ToastApi['update']>((id, updates) => {
    setToasts(prev => prev.map(t => {
      if (t.id !== id) return t;
      const progress = updates.progressBarPercentage !== undefined
        ? normalizeProgress(updates.progressBarPercentage)
        : t.progress;

      const next: ToastInstance = {
        ...t,
        ...updates,
        progress,
      } as ToastInstance;

      // Detect completion but do not auto-flip to success.
      // Callers (e.g., compare workbench) explicitly set alertType when done.
      if (typeof progress === 'number' && progress >= 100 && !t.justCompleted) {
        next.justCompleted = true;
      }

      return next;
    }));
  }, []);

  const updateProgress = useCallback<ToastApi['updateProgress']>((id, progress) => {
    update(id, { progressBarPercentage: progress });
  }, [update]);

  const dismiss = useCallback<ToastApi['dismiss']>((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const dismissAll = useCallback<ToastApi['dismissAll']>(() => {
    setToasts([]);
    Object.values(timers.current).forEach(t => window.clearTimeout(t));
    timers.current = {};
  }, []);

  const value = useMemo<ToastContextShape>(() => ({
    toasts,
    show,
    update,
    updateProgress,
    dismiss,
    dismissAll,
  }), [toasts, show, update, updateProgress, dismiss, dismissAll]);

  // Handle expand/collapse toggles from renderer without widening API
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string } | undefined;
      if (!detail?.id) return;
      setToasts(prev => prev.map(t => t.id === detail.id ? { ...t, isExpanded: !t.isExpanded } : t));
    };
    window.addEventListener('toast:toggle', handler as EventListener);
    return () => window.removeEventListener('toast:toggle', handler as EventListener);
  }, []);

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}


