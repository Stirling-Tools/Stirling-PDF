import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { alert } from '@app/components/toast';
import { setupApiInterceptors as coreSetup } from '@core/services/apiClientSetup';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { createBackendNotReadyError } from '@app/constants/backendErrors';
import { operationRouter } from '@app/services/operationRouter';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';
import { STIRLING_SAAS_URL, STIRLING_SAAS_BACKEND_API_URL } from '@app/constants/connection';
import i18n from '@app/i18n';

const BACKEND_TOAST_COOLDOWN_MS = 4000;
let lastBackendToast = 0;

// Extended config for custom properties
interface ExtendedRequestConfig extends InternalAxiosRequestConfig {
  operationName?: string;
  skipBackendReadyCheck?: boolean;
  skipAuthRedirect?: boolean;
  _retry?: boolean;
  _isSaaSRequest?: boolean;
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

      // IMPORTANT: Check backend readiness BEFORE modifying URL
      // Pattern matching in shouldSkipBackendReadyCheck() needs original relative URL
      const originalUrl = extendedConfig.url;
      const skipCheck = extendedConfig.skipBackendReadyCheck === true;
      const skipForSaaSBackend = await operationRouter.shouldSkipBackendReadyCheck(originalUrl);

      try {
        // Get the appropriate base URL for this request
        const baseUrl = await operationRouter.getBaseUrl(originalUrl);

        // Build the full URL
        if (extendedConfig.url && !extendedConfig.url.startsWith('http')) {
          extendedConfig.url = `${baseUrl}${extendedConfig.url}`;
        }

        localStorage.setItem('server_url', baseUrl);

        // Debug logging
        console.debug(`[apiClientSetup] Request to: ${extendedConfig.url}`);

        // Determine if this request needs authentication
        // - Local bundled backend: No auth (security disabled)
        // - SaaS backend: Needs auth token
        // - Self-hosted backend: Needs auth token
        const isRemote = await operationRouter.isSelfHostedMode();
        const isSaaSBackendRequest = baseUrl === STIRLING_SAAS_BACKEND_API_URL;
        const needsAuth = isRemote || isSaaSBackendRequest;

        // Tag request so error handler can identify SaaS backend errors without URL matching
        extendedConfig._isSaaSRequest = isSaaSBackendRequest;

        console.debug(`[apiClientSetup] Auth check: isRemote=${isRemote}, isSaaSBackendRequest=${isSaaSBackendRequest}, needsAuth=${needsAuth}, baseUrl=${baseUrl}`);

        if (needsAuth) {
          // Enable credentials for session management
          extendedConfig.withCredentials = true;

          // If another request is already refreshing, wait before attaching token
          await authService.awaitRefreshIfInProgress();
          const token = await authService.getAuthToken();

          if (token) {
            extendedConfig.headers.Authorization = `Bearer ${token}`;
            console.debug(`[apiClientSetup] Added auth token for request to: ${extendedConfig.url}`);
          } else {
            console.warn(`[apiClientSetup] No auth token available for: ${extendedConfig.url}`);
          }
        } else {
          // Local bundled backend: disable credentials (security disabled)
          extendedConfig.withCredentials = false;
        }
      } catch (error) {
        console.error('[apiClientSetup] Error in request interceptor:', error);
        // Continue with request even if routing/auth logic fails
        // This ensures requests aren't blocked by interceptor errors
      }

      // Backend readiness check (for local backend)
      const isSaaS = await operationRouter.isSaaSMode();
      const backendHealthy = tauriBackendService.isBackendHealthy();
      const backendStatus = tauriBackendService.getBackendStatus();
      const backendPort = tauriBackendService.getBackendPort();

      console.debug(`[apiClientSetup] Backend readiness check for ${extendedConfig.url}: isSaaS=${isSaaS}, skipCheck=${skipCheck}, skipForSaaSBackend=${skipForSaaSBackend}, backendHealthy=${backendHealthy}, backendStatus=${backendStatus}, backendPort=${backendPort}`);

      if (isSaaS && !skipCheck && !skipForSaaSBackend && !backendHealthy) {
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

  // Response interceptor: Handle auth errors and update credits from headers
  client.interceptors.response.use(
    async (response) => {
      // Check for credit balance update in response headers
      // Backend includes X-Credits-Remaining header after operations that consume credits
      const creditsHeader = response.headers['x-credits-remaining'];

      if (creditsHeader !== undefined && creditsHeader !== null) {
        const creditsRemaining = parseInt(creditsHeader, 10);

        if (!isNaN(creditsRemaining)) {
          // Dispatch event with new balance for immediate update
          window.dispatchEvent(new CustomEvent('credits:updated', {
            detail: { creditsRemaining }
          }));
        }
      }

      return response;
    },
    async (error) => {
      const originalRequest = error.config as ExtendedRequestConfig;
      const requestUrl = String(originalRequest?.url || '');
      const isAuthProbeRequest = requestUrl.includes('/api/v1/auth/me');

      // Handle 401 Unauthorized - try to refresh token
      if (error.response?.status === 401 && !originalRequest._retry) {
        // `/auth/me` is used as a probe by session bootstrap; refreshing here can
        // create recursion (refresh -> save token -> jwt-available -> /auth/me).
        if (isAuthProbeRequest) {
          return Promise.reject(error);
        }
        if (typeof window !== 'undefined') {
          console.warn('[apiClientSetup] 401 on path:', window.location.pathname, 'url:', originalRequest.url);
        }
        if (originalRequest.skipAuthRedirect) {
          return Promise.reject(error);
        }
        originalRequest._retry = true;

        console.debug(`[apiClientSetup] 401 error, attempting token refresh for: ${originalRequest.url}`);

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
          console.debug(`[apiClientSetup] Token refreshed, retrying request to: ${originalRequest.url}`);

          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          } else {
            console.error(`[apiClientSetup] No token available after successful refresh!`);
          }

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
