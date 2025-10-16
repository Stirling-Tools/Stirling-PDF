// frontend/src/services/http.ts
import axios from 'axios';
import { handleHttpError } from './httpErrorHandler';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/', // Use env var or relative path (proxied by Vite in dev)
  responseType: 'json',
});

// Helper function to get JWT token from cookies
function getJwtTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'stirling_jwt') {
      return value;
    }
  }
  return null;
}

// ---------- Install request interceptor to add JWT token ----------
apiClient.interceptors.request.use(
  (config) => {
    // Get JWT token from cookie
    const jwtToken = getJwtTokenFromCookie();

    // If token exists and Authorization header is not already set, add it
    if (jwtToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${jwtToken}`;
      console.debug('[API Client] Added JWT token from cookie to Authorization header');
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
