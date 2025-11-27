import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { alert } from '@app/components/toast';
import { setupApiInterceptors as coreSetup } from '@core/services/apiClientSetup';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { createBackendNotReadyError } from '@app/constants/backendErrors';
import { operationRouter } from '@app/services/operationRouter';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';
import { STIRLING_SAAS_URL } from '@app/constants/connection';
import i18n from '@app/i18n';

const BACKEND_TOAST_COOLDOWN_MS = 4000;
let lastBackendToast = 0;

// Extended config for custom properties
interface ExtendedRequestConfig extends InternalAxiosRequestConfig {
  operationName?: string;
  skipBackendReadyCheck?: boolean;
  _retry?: boolean;
}

/**
 * Desktop-specific API interceptors
 * - Reuses the core interceptors
 * - Dynamically sets base URL based on connection mode
 * - Adds auth token for remote server requests
 * - Blocks API calls while the bundled backend is still starting
 * - Handles auth token refresh on 401 errors
 */
export function setupApiInterceptors(client: AxiosInstance): void {
  coreSetup(client);

  // Request interceptor: Set base URL and auth headers dynamically
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const extendedConfig = config as ExtendedRequestConfig;

      // Get the appropriate base URL for this request
      const baseUrl = await operationRouter.getBaseUrl(extendedConfig.url);

      // Build the full URL
      if (extendedConfig.url && !extendedConfig.url.startsWith('http')) {
        extendedConfig.url = `${baseUrl}${extendedConfig.url}`;
      }

      // Add auth token for all remote requests (self-hosted or SaaS auth endpoints)
      // Skip if this is a retry - the response interceptor already set the correct header
      const target = await operationRouter.getExecutionTarget(extendedConfig.url);
      if (target === 'remote' && !extendedConfig._retry) {
        const token = await authService.getAuthToken();
        if (token) {
          extendedConfig.headers.Authorization = `Bearer ${token}`;
          console.debug(`[apiClientSetup] Added auth header for remote request to: ${extendedConfig.url}`);
        } else {
          console.debug(`[apiClientSetup] No token available for remote request to: ${extendedConfig.url}`);
        }
      } else if (extendedConfig._retry) {
        console.debug(`[apiClientSetup] Retry request - preserving existing auth header for: ${extendedConfig.url}`);
      } else {
        console.debug(`[apiClientSetup] Local request, no auth header needed: ${extendedConfig.url}`);
      }

      // Backend readiness check (for local backend)
      const skipCheck = extendedConfig.skipBackendReadyCheck === true;
      const isSaaS = await operationRouter.isSaaSMode();

      if (isSaaS && !skipCheck && !tauriBackendService.isBackendHealthy()) {
        const method = (extendedConfig.method || 'get').toLowerCase();
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

      return extendedConfig;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor: Handle auth errors
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config as ExtendedRequestConfig;

      // Handle 401 Unauthorized - try to refresh token
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        console.debug(`[apiClientSetup] 401 error, attempting token refresh for: ${originalRequest.url}`);
        const origAuth = originalRequest.headers.Authorization;
        console.debug(`[apiClientSetup] Original auth header start: ${origAuth?.substring(0, 50)}...`);
        console.debug(`[apiClientSetup] Original auth header end: ...${origAuth?.substring(origAuth.length - 50)}`);

        const isRemote = await operationRouter.isSelfHostedMode();
        let refreshed = false;

        if (isRemote) {
          // Self-hosted mode: use Spring Boot refresh endpoint
          const serverConfig = await connectionModeService.getServerConfig();
          if (serverConfig) {
            refreshed = await authService.refreshToken(serverConfig.url);
          }
        } else {
          // SaaS mode: use Supabase refresh endpoint
          refreshed = await authService.refreshSupabaseToken(STIRLING_SAAS_URL);
        }

        if (refreshed) {
          // Retry the original request with new token
          const token = await authService.getAuthToken();
          console.debug(`[apiClientSetup] Got token after refresh (length: ${token?.length})`);
          console.debug(`[apiClientSetup] New token start: ${token?.substring(0, 50)}...`);
          console.debug(`[apiClientSetup] New token end: ...${token?.substring(token.length - 50)}`);

          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            const newAuth = originalRequest.headers.Authorization;
            console.debug(`[apiClientSetup] Set new Authorization header for retry (start): ${newAuth.substring(0, 50)}...`);
            console.debug(`[apiClientSetup] Set new Authorization header for retry (end): ...${newAuth.substring(newAuth.length - 50)}`);
          } else {
            console.error(`[apiClientSetup] No token available after successful refresh!`);
          }

          console.debug(`[apiClientSetup] Retrying request to: ${originalRequest.url}`);
          return client.request(originalRequest);
        }

        // Refresh failed - user needs to login again
        alert({
          alertType: 'error',
          title: i18n.t('auth.sessionExpired', 'Session Expired'),
          body: i18n.t('auth.pleaseLoginAgain', 'Please login again.'),
          isPersistentPopup: false,
        });
      }

      // Handle 403 Forbidden - unauthorized access
      if (error.response?.status === 403) {
        alert({
          alertType: 'error',
          title: i18n.t('auth.accessDenied', 'Access Denied'),
          body: i18n.t('auth.insufficientPermissions', 'You do not have permission to perform this action.'),
          isPersistentPopup: false,
        });
      }

      return Promise.reject(error);
    }
  );
}
