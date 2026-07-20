/**
 * Desktop-specific API client using Tauri's native HTTP client
 * This file overrides @core/services/apiClient.ts for desktop builds
 * Bypasses CORS restrictions by using native HTTP instead of browser fetch
 */

import type { AxiosInstance } from "axios";
import { create } from "@editor/services/tauriHttpClient";
import { handleHttpError } from "@editor/services/httpErrorHandler";
import { setupApiInterceptors } from "@editor/services/apiClientSetup";
import { getApiBaseUrl } from "@editor/services/apiClientConfig";

// Create Tauri HTTP client with default config
const apiClient = create({
  baseURL: getApiBaseUrl(),
  responseType: "json",
  withCredentials: false, // Desktop doesn't need credentials
});

// Setup interceptors (desktop-specific auth and backend ready checks)
// Cast to AxiosInstance - Tauri client has compatible API
setupApiInterceptors(apiClient as unknown as AxiosInstance);

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
