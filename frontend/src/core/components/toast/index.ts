import { ToastApi, ToastInstance, ToastOptions } from '@app/components/toast/types';
import { useToast, ToastProvider } from '@app/components/toast/ToastContext';
import ToastRenderer from '@app/components/toast/ToastRenderer';

export { useToast, ToastProvider, ToastRenderer };

// Global imperative API via module singleton
let _api: ReturnType<typeof createImperativeApi> | null = null;

type ToastContextApi = ToastApi & { toasts: ToastInstance[] };

function createImperativeApi() {
  const subscribers: Array<(fn: ToastContextApi) => void> = [];
  let api: ToastContextApi | null = null;
  return {
    provide(instance: ToastContextApi) {
      api = instance;
      subscribers.splice(0).forEach(cb => cb(instance));
    },
    get(): ToastContextApi | null {
      return api;
    },
    onReady(cb: (readyApi: ToastContextApi) => void) {
      if (api) {
        cb(api);
      } else {
        subscribers.push(cb);
      }
    },
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

export function alert(options: ToastOptions) {
  if (_api?.get()) {
    return _api.get()!.show(options);
  }
  // Queue until provider mounts
  let id = '';
  _api?.onReady((api) => { id = api.show(options); });
  return id;
}

export function updateToast(id: string, options: Partial<ToastOptions>) {
  _api?.get()?.update(id, options);
}

export function updateToastProgress(id: string, progress: number) {
  _api?.get()?.updateProgress(id, progress);
}

export function dismissToast(id: string) {
  _api?.get()?.dismiss(id);
}

export function dismissAllToasts() {
  _api?.get()?.dismissAll();
}

