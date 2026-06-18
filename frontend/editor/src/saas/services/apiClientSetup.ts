import type { AxiosInstance } from "axios";
import { getAccessToken } from "@app/auth/session";

/** SaaS auth headers for raw fetch() calls — access token from current session. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** No-op: SaaS apiClient wires its own interceptors (see saas/services/apiClient.ts). */
export function setupApiInterceptors(_client: AxiosInstance): void {}
