import axios from 'axios';
import { handleHttpError } from '@app/services/httpErrorHandler';
import { setupApiInterceptors } from '@app/services/apiClientSetup';
import { getApiBaseUrl, reportBackendFailure } from '@app/services/apiClientConfig';

// Create axios instance with default config
const apiClient = axios.create({
  responseType: 'json',
});

apiClient.interceptors.request.use((config) => {
  if (!config.baseURL) {
    config.baseURL = getApiBaseUrl();
  }
  return config;
});

// Setup interceptors (core does nothing, proprietary adds JWT auth)
setupApiInterceptors(apiClient);

// ---------- Install error interceptor ----------
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const isServerOrNetworkFailure = !status || status >= 500;
      if (isServerOrNetworkFailure) {
        reportBackendFailure(error.config?.baseURL);
      }
    }
    await handleHttpError(error); // Handle error (shows toast unless suppressed)
    return Promise.reject(error);
  }
);


// ---------- Exports ----------
export default apiClient;
