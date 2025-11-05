import axios from 'axios';
import { handleHttpError } from '@app/services/httpErrorHandler';
import { setupApiInterceptors } from '@app/services/apiClientSetup';
import { getApiBaseUrl } from '@app/services/apiClientConfig';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  responseType: 'json',
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
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
