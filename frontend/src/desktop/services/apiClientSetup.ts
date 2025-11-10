import { AxiosInstance } from 'axios';
import { alert } from '@app/components/toast';
import { setupApiInterceptors as coreSetup } from '@core/services/apiClientSetup';
import { tauriBackendService } from '@app/services/tauriBackendService';

const BACKEND_TOAST_COOLDOWN_MS = 4000;
let lastBackendToast = 0;

/**
 * Desktop-specific API interceptors
 * - Reuses the core interceptors
 * - Blocks API calls while the bundled backend is still starting and shows
 *   a friendly toast for user-initiated requests (non-GET)
 */
export function setupApiInterceptors(client: AxiosInstance): void {
  coreSetup(client);

  client.interceptors.request.use(
    (config) => {
      const skipCheck = config?.skipBackendReadyCheck === true;
      if (skipCheck || tauriBackendService.isBackendHealthy()) {
        return config;
      }

      const method = (config.method || 'get').toLowerCase();
      if (method !== 'get') {
        const now = Date.now();
        if (now - lastBackendToast > BACKEND_TOAST_COOLDOWN_MS) {
          lastBackendToast = now;
          alert({
            alertType: 'error',
            title: 'Backend still starting',
            body: 'Please wait for the embedded backend to finish launching and try again.',
            isPersistentPopup: false,
          });
        }
      }

      const error = new Error('Backend is not ready yet');
      (error as any).code = 'BACKEND_NOT_READY';
      return Promise.reject(error);
    }
  );
}
