import { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function getJwtTokenFromStorage(): string | null {
  try {
    return localStorage.getItem('stirling_jwt');
  } catch (error) {
    console.error('[API Client] Failed to read JWT from localStorage:', error);
    return null;
  }
}

function setJwtTokenInStorage(token: string): void {
  try {
    localStorage.setItem('stirling_jwt', token);
    console.debug('[API Client] Stored new JWT token in localStorage');
  } catch (error) {
    console.error('[API Client] Failed to store JWT in localStorage:', error);
  }
}

function clearJwtTokenFromStorage(): void {
  try {
    localStorage.removeItem('stirling_jwt');
    console.debug('[API Client] Cleared JWT token from localStorage');
  } catch (error) {
    console.error('[API Client] Failed to clear JWT from localStorage:', error);
  }
}

function getXsrfToken(): string | null {
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'XSRF-TOKEN') {
        return decodeURIComponent(value);
      }
    }
    return null;
  } catch (error) {
    console.error('[API Client] Failed to read XSRF token from cookies:', error);
    return null;
  }
}

function processQueue(error: Error | null, token: string | null = null): void {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

async function refreshAuthToken(client: AxiosInstance): Promise<string> {
  console.log('[API Client] Refreshing expired JWT token...');

  try {
    const response = await client.post('/api/v1/auth/refresh', {}, {
      // Don't retry refresh requests to avoid infinite loops
      headers: { 'X-Skip-Auth-Refresh': 'true' }
    });

    const newToken = response.data?.session?.access_token;
    if (!newToken) {
      throw new Error('No access token in refresh response');
    }

    setJwtTokenInStorage(newToken);
    console.log('[API Client] ✅ Token refreshed successfully');
    return newToken;
  } catch (error) {
    console.error('[API Client] ❌ Token refresh failed:', error);
    clearJwtTokenFromStorage();

    // Redirect to login
    if (window.location.pathname !== '/login') {
      console.log('[API Client] Redirecting to login page...');
      window.location.href = '/login';
    }

    throw error;
  }
}

export function setupApiInterceptors(client: AxiosInstance): void {
  // Install request interceptor to add JWT token
  client.interceptors.request.use(
    (config) => {
      const jwtToken = getJwtTokenFromStorage();
      const xsrfToken = getXsrfToken();

      if (jwtToken && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${jwtToken}`;
        console.debug('[API Client] Added JWT token from localStorage to Authorization header');
      }

      if (xsrfToken && !config.headers['X-XSRF-TOKEN']) {
        config.headers['X-XSRF-TOKEN'] = xsrfToken;
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Install response interceptor to handle 401 and auto-refresh token
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // Skip refresh for auth endpoints or if explicitly disabled
      if (
        !originalRequest ||
        originalRequest.url?.includes('/api/v1/auth/') ||
        originalRequest.headers?.['X-Skip-Auth-Refresh'] ||
        originalRequest._retry
      ) {
        return Promise.reject(error);
      }

      // Handle 401 errors by attempting token refresh
      if (error.response?.status === 401 && getJwtTokenFromStorage()) {
        console.warn('[API Client] Received 401 error, attempting token refresh...');

        if (isRefreshing) {
          // Already refreshing - queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return client(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const newToken = await refreshAuthToken(client);
          processQueue(null, newToken);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as Error, null);
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );
}
