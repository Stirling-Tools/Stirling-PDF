import { AxiosInstance } from 'axios';

function getJwtTokenFromStorage(): string | null {
  try {
    return localStorage.getItem('stirling_jwt');
  } catch (error) {
    console.error('[API Client] Failed to read JWT from localStorage:', error);
    return null;
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
}
