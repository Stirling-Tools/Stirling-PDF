import type { AxiosInstance } from "axios";
import { supabase } from "@app/auth/supabase";

/**
 * SaaS auth headers for raw fetch() calls (e.g. AI chat streaming).
 *
 * Pulls the live Supabase access token. Required because the SaaS apiClient's
 * axios interceptor attaches this header to every axios call, but raw fetch()
 * calls bypass that path and end up with no Authorization header → backend
 * returns 401. The chat streaming endpoint uses fetch() (not axios) because
 * axios doesn't stream SSE responses well, so this override exists to give
 * it the same bearer token the axios calls already get.
 *
 * supabase.auth.getSession() reads from in-memory cache when possible; only
 * issues a network request if the session needs refreshing. Adds an Accept
 * header so the backend negotiates JSON correctly.
 */
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

/**
 * SaaS apiClient wires up its own interceptors inline (see saas/services/apiClient.ts).
 * This re-export exists so the cascade through @app/services/apiClientSetup
 * remains consistent for callers that import setupApiInterceptors — currently
 * none in SaaS mode, but keeps the shape uniform.
 */
export function setupApiInterceptors(_client: AxiosInstance): void {
  // No-op: SaaS apiClient handles its own interceptors with the Supabase session.
}
