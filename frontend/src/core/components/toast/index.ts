import { ToastOptions, ToastApi } from '@app/components/toast/types';
import { useToast, ToastProvider } from '@app/components/toast/ToastContext';
import ToastRenderer from '@app/components/toast/ToastRenderer';

export { useToast, ToastProvider, ToastRenderer };

type ToastContextInstance = ReturnType<typeof useToast>;

interface ImperativeApi {
  provide(instance: ToastContextInstance): void;
  get(): ToastContextInstance | null;
  onReady(cb: (api: ToastContextInstance) => void): void;
}

// Global imperative API via module singleton
let _api: ImperativeApi | null = null;

function createImperativeApi(): ImperativeApi {
  const subscribers: Array<(api: ToastContextInstance) => void> = [];
  let api: ToastContextInstance | null = null;
  return {
    provide(instance: ToastContextInstance) {
      api = instance;
      const queued = [...subscribers];
      subscribers.length = 0;
      queued.forEach(cb => cb(instance));
    },
    get(): ToastContextInstance | null { return api; },
    onReady(cb: (readyApi: ToastContextInstance) => void) {
      if (api) cb(api); else subscribers.push(cb);
    }
  };
}

if (!_api) _api = createImperativeApi();

// Hook helper to wire context API back to singleton
export function ToastPortalBinder() {
  const ctx = useToast();
  // Provide API once mounted
  _api!.provide(ctx);
  return null;
}

function getImperativeApi(): ToastApi | null {
  return _api?.get() ?? null;
}

export function alert(options: ToastOptions): string {
  const api = getImperativeApi();
  if (api) {
    return api.show(options);
  }
  // Queue until provider mounts
  let id = '';
  _api?.onReady((readyApi) => { id = readyApi.show(options); });
  return id;
}

export function updateToast(id: string, options: Partial<ToastOptions>): void {
  getImperativeApi()?.update(id, options);
}

export function updateToastProgress(id: string, progress: number): void {
  getImperativeApi()?.updateProgress(id, progress);
}

export function dismissToast(id: string): void {
  getImperativeApi()?.dismiss(id);
}

export function dismissAllToasts(): void {
  getImperativeApi()?.dismissAll();
}
