import type { AxiosInstance } from 'axios';
import { getBrowserId } from '@app/utils/browserIdentifier';

function readXsrfToken(): string | undefined {
  const match = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='));

  return match ? decodeURIComponent(match.substring('XSRF-TOKEN='.length)) : undefined;
}

export function setupApiInterceptors(client: AxiosInstance): void {
  // Add browser ID header for WAU tracking
  client.interceptors.request.use(
    (config) => {
      const browserId = getBrowserId();
      config.headers['X-Browser-Id'] = browserId;
      const token = readXsrfToken();
      if (token) {
        config.headers = config.headers ?? {};
        config.headers['X-XSRF-TOKEN'] = token;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
}
