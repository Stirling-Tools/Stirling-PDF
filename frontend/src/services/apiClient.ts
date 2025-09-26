// frontend/src/services/http.ts
import axios from 'axios';
import { handleHttpError } from './httpErrorHandler';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/', // Use env var or relative path (proxied by Vite in dev)
  responseType: 'json',
});

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
