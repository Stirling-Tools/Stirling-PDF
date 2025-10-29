import { AxiosInstance } from 'axios';

function getJwtTokenFromStorage(): string | null {
  try {
    return localStorage.getItem('stirling_jwt');
  } catch (error) {
    console.error('[API Client] Failed to read JWT from localStorage:', error);
    return null;
  }
}

export function setupApiInterceptors(client: AxiosInstance): void {
  // Install request interceptor to add JWT token
  client.interceptors.request.use(
    (config) => {
      const jwtToken = getJwtTokenFromStorage();

      if (jwtToken && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${jwtToken}`;
        console.debug('[API Client] Added JWT token from localStorage to Authorization header');
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
}
