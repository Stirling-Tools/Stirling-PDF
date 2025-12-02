import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { alert } from '@app/components/toast';
import { setupApiInterceptors as coreSetup } from '@core/services/apiClientSetup';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { createBackendNotReadyError } from '@app/constants/backendErrors';
import { operationRouter } from '@app/services/operationRouter';
import { authService } from '@app/services/authService';
import { connectionModeService } from '@app/services/connectionModeService';
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
 * Extract CSRF token from cookie
 */
function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'XSRF-TOKEN') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Fetch fresh CSRF token by making a lightweight GET request
 * Prevents stale tokens due to Spring Security's token rotation
 */
async function fetchFreshCsrfToken(client: AxiosInstance): Promise<string | null> {
  try {
    // Make a lightweight GET that triggers CSRF token rotation
    await client.get('/api/v1/config/app-config', {
      skipBackendReadyCheck: true,
    } as any);

    return getCsrfTokenFromCookie();
  } catch (error) {
    console.error('[apiClientSetup] Failed to fetch fresh CSRF token:', error);
    return getCsrfTokenFromCookie();
  }
}

/**
 * Store CSRF token from response header to document.cookie
 * Tauri webview and backend have different origins, so we manually sync cookies
 */
function storeCsrfTokenFromResponse(headers: any): void {
  const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
  if (setCookie) {
    const cookieString = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    const match = cookieString.match(/XSRF-TOKEN=([^;]+)/);
    if (match) {
      const newToken = decodeURIComponent(match[1]);
      try {
        document.cookie = `XSRF-TOKEN=${encodeURIComponent(newToken)}; Path=/; SameSite=Lax`;
      } catch (e) {
        console.error('[apiClientSetup] Failed to set CSRF cookie:', e);
      }
    }
  }
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

      // Get the operation name from config if provided
      const operation = extendedConfig.operationName;

      // Get the appropriate base URL for this operation
      const baseUrl = await operationRouter.getBaseUrl(operation);

      // Build the full URL
      if (extendedConfig.url && !extendedConfig.url.startsWith('http')) {
        extendedConfig.url = `${baseUrl}${extendedConfig.url}`;
      }

      // Debug logging
      console.debug(`[apiClientSetup] Request to: ${extendedConfig.url}`);

      // Add auth token for remote requests and enable credentials
      const isRemote = await operationRouter.isSelfHostedMode();
      if (isRemote) {
        // Self-hosted mode: enable credentials for session management
        extendedConfig.withCredentials = true;

        const token = await authService.getAuthToken();
        if (token) {
          extendedConfig.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn('[apiClientSetup] Self-hosted mode but no auth token available');
        }

        // Add CSRF token for self-hosted servers with security enabled
        // For POST/PUT/DELETE, fetch a fresh token first to avoid rotation issues
        const method = (extendedConfig.method || 'GET').toUpperCase();
        const isMutatingRequest = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

        let freshToken: string | null = null;
        if (isMutatingRequest) {
          freshToken = await fetchFreshCsrfToken(client);
        } else {
          freshToken = getCsrfTokenFromCookie();
        }

        if (freshToken) {
          extendedConfig.headers['X-XSRF-TOKEN'] = freshToken;
        }
      } else {
        // SaaS mode: disable credentials (security disabled on local backend)
        extendedConfig.withCredentials = false;
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

  // Response interceptor: Extract CSRF token and handle auth errors
  client.interceptors.response.use(
    (response) => {
      // Extract and store CSRF token from response headers
      if (response.headers) {
        storeCsrfTokenFromResponse(response.headers);
      }
      return response;
    },
    async (error) => {
      const originalRequest = error.config as ExtendedRequestConfig;

      // Handle 401 Unauthorized - try to refresh token
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        const isRemote = await operationRouter.isSelfHostedMode();
        if (isRemote) {
          const serverConfig = await connectionModeService.getServerConfig();
          if (serverConfig) {
            const refreshed = await authService.refreshToken(serverConfig.url);
            if (refreshed) {
              // Retry the original request with new token
              const token = await authService.getAuthToken();
              if (token) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return client(originalRequest);
            }
          }
        }

        // Refresh failed or not in remote mode - user needs to login again
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
