import type { AxiosInstance } from "axios";
import { supabase } from "@app/auth/supabase";

/** SaaS auth headers for raw fetch() calls — Supabase access token from current session. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch (e) {
    console.warn("[apiClientSetup] Failed to read Supabase session", e);
  }
  return headers;
}

/** No-op: SaaS apiClient wires its own interceptors (see saas/services/apiClient.ts). */
export function setupApiInterceptors(_client: AxiosInstance): void {}
