import axios from "axios";
import { handleHttpError } from "@editor/services/httpErrorHandler";
import { setupApiInterceptors } from "@editor/services/apiClientSetup";
import { getApiBaseUrl } from "@editor/services/apiClientConfig";
import {
  inMemoryFormData,
  uploadsNeedInMemoryFiles,
} from "@editor/utils/inMemoryFile";

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  responseType: "json",
  withCredentials: true,
});

// Setup interceptors (core does nothing, proprietary adds JWT auth)
setupApiInterceptors(apiClient);

if (
  typeof navigator !== "undefined" &&
  uploadsNeedInMemoryFiles(navigator.userAgent)
) {
  apiClient.interceptors.request.use(async (config) =>
    config.data instanceof FormData
      ? { ...config, data: await inMemoryFormData(config.data) }
      : config,
  );
}

// ---------- Install error interceptor ----------
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    await handleHttpError(error); // Handle error (shows toast unless suppressed)
    return Promise.reject(error);
  },
);

// ---------- Exports ----------
export default apiClient;
