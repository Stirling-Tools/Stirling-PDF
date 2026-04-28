import axios from "axios";
import { handleHttpError } from "@app/services/httpErrorHandler";
import { setupApiInterceptors } from "@app/services/apiClientSetup";
import { getApiBaseUrl } from "@app/services/apiClientConfig";

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  responseType: "json",
  withCredentials: true,
});

// Setup interceptors (core does nothing, proprietary adds JWT auth)
setupApiInterceptors(apiClient);

// Strip a manually-set "Content-Type: multipart/form-data" (no boundary) for
// FormData bodies so axios generates one with a boundary. Browsers' XHR/fetch
// silently fix this up; Tauri's WebView does not, so the request reaches the
// server boundary-less and Jetty rejects it with
// "No multipart boundary parameter in Content-Type".
apiClient.interceptors.request.use((config) => {
  if (config.data instanceof FormData && config.headers) {
    const ct =
      (config.headers as any)["Content-Type"] ??
      (config.headers as any)["content-type"];
    if (typeof ct === "string" && ct.toLowerCase() === "multipart/form-data") {
      delete (config.headers as any)["Content-Type"];
      delete (config.headers as any)["content-type"];
    }
  }
  return config;
});

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
