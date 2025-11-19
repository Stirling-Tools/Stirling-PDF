import { AxiosInstance } from 'axios';
import { isTauri } from '@tauri-apps/api/core';
import { alert } from '@app/components/toast';
import { setupApiInterceptors as coreSetup } from '@core/services/apiClientSetup';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { createBackendNotReadyError } from '@app/constants/backendErrors';
import i18n from '@app/i18n';

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

  const shouldRewriteBaseUrl = isTauri();

  client.interceptors.request.use(
    async (config) => {
      const skipCheck = config?.skipBackendReadyCheck === true;
      if (!skipCheck && !tauriBackendService.isBackendHealthy()) {
        const method = (config.method || 'get').toLowerCase();
        if (method !== 'get') {
          const now = Date.now();
          if (now - lastBackendToast > BACKEND_TOAST_COOLDOWN_MS) {
            lastBackendToast = now;
            alert({
              alertType: 'error',
              title: i18n.t('backendHealth.offline', 'Backend Offline'),
              body: i18n.t('backendHealth.wait', 'Please wait for the backend to finish launching and try again.'),
              isPersistentPopup: false,
            });
          }
        }
        return Promise.reject(createBackendNotReadyError());
      }

      if (shouldRewriteBaseUrl) {
        const backendUrl = await tauriBackendService.ensureBackendUrl();
        // Only overwrite when request is relative (most client calls)
        if (!config.url || !config.url.startsWith('http')) {
          config.baseURL = backendUrl;
        }
      }

      return config;
    }
  );
}
