import type { AxiosInstance } from "axios";
import { getBrowserId } from "@app/utils/browserIdentifier";

export function setupApiInterceptors(client: AxiosInstance): void {
  // Add browser ID header for WAU tracking
  client.interceptors.request.use(
    (config) => {
      const browserId = getBrowserId();
      config.headers["X-Browser-Id"] = browserId;
      return config;
    },
    (error) => Promise.reject(error),
  );
}

/** Auth headers for raw fetch() calls — empty in core; proprietary/SaaS override. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return {};
}
