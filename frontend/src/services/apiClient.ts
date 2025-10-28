// frontend/src/services/http.ts
import axios from 'axios';
import { isTauri } from '@tauri-apps/api/core';
import { handleHttpError } from './httpErrorHandler';

// TypeScript module augmentation for custom config properties
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipErrorToast?: boolean;
  }
}

// Create axios instance with default config
const apiClient = axios.create({
  // In Tauri mode, use absolute URL to localhost backend
  // In web mode, use relative URL (same origin in production, proxied in dev)
  baseURL: isTauri() ? 'http://localhost:8080' : (import.meta.env.VITE_API_BASE_URL || '/'),
  responseType: 'json',
});

// Helper function to get JWT token from localStorage
function getJwtTokenFromStorage(): string | null {
  try {
    return localStorage.getItem('stirling_jwt');
  } catch (error) {
    console.error('[API Client] Failed to read JWT from localStorage:', error);
    return null;
  }
}

// ---------- Install request interceptor to add JWT token ----------
apiClient.interceptors.request.use(
  (config) => {
    // Get JWT token from localStorage
    const jwtToken = getJwtTokenFromStorage();

    // If token exists and Authorization header is not already set, add it
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

// ---------- Install error interceptor ----------
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Check if this request wants to skip error toasts (e.g., health checks, background polls)
    if (!error.config?.skipErrorToast) {
      await handleHttpError(error); // Handle error (shows toast unless suppressed)
    }
    return Promise.reject(error);
  }
);


// ---------- Exports ----------
export default apiClient;
