// frontend/src/services/http.ts
import axios from 'axios';
import { handleHttpError } from '@app/services/httpErrorHandler';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/', // Use env var or relative path (proxied by Vite in dev)
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
    await handleHttpError(error); // Handle error (shows toast unless suppressed)
    return Promise.reject(error);
  }
);


// ---------- Exports ----------
export default apiClient;
