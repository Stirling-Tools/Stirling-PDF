import axios from 'axios';
import { handleHttpError } from '@app/services/httpErrorHandler';
import { isTauri } from '@tauri-apps/api/core';
import { setupApiInterceptors } from '@app/services/apiClientSetup';

// Determine base URL depending on environment
const desktopBaseUrl = (() => {
  if (!isTauri()) {
    return import.meta.env.VITE_API_BASE_URL || '/';
  }

  if (import.meta.env.DEV) {
    // During tauri dev we rely on Vite proxy, so use relative path to avoid CORS preflight
    return '/';
  }

  return import.meta.env.VITE_DESKTOP_BACKEND_URL || 'http://localhost:8080';
})();

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: desktopBaseUrl,
  responseType: 'json',
});

// Setup interceptors (core does nothing, proprietary adds JWT auth)
setupApiInterceptors(apiClient);

// ---------- Install error interceptor ----------
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    await handleHttpError(error); // Handle error (shows toast unless suppressed)
    return Promise.reject(error);
  }
);


// ---------- Exports ----------
export default apiClient;
