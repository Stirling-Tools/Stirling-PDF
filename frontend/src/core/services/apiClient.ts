import axios from 'axios';
import { handleHttpError } from '@app/services/httpErrorHandler';
import { isTauri } from '@tauri-apps/api/core';
import { setupApiInterceptors } from '@app/services/apiClientSetup';

// Create axios instance with default config
const apiClient = axios.create({
  // In Tauri mode, use absolute URL to localhost backend
  // In web mode, use relative URL (same origin in production, proxied in dev)
  baseURL: isTauri() ? 'http://localhost:8080' : (import.meta.env.VITE_API_BASE_URL || '/'),
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
