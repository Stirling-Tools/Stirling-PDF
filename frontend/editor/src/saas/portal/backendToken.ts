import { getAccessToken } from "@app/auth/session";

/**
 * SaaS build: the backend authenticates with the admin's Supabase web-session
 * access token - the same `@app/auth/session` seam the editor's SaaS apiClient
 * reads. So the portal's existing admin endpoints work against the SaaS backend
 * with no per-call changes; only the bearer differs.
 */
export async function getBackendToken(): Promise<string | null> {
  return getAccessToken();
}
