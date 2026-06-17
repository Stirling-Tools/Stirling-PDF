import { getAccessToken } from "@portal/auth/session";

export interface BackendTarget {
  baseUrl: string;
  getAuthHeaders(): Promise<Record<string, string>>;
}

/**
 * The SaaS backend. Same-origin (relative paths via the proxy) with a Supabase
 * bearer token when the session is authenticated. `getAccessToken` is a stub
 * returning null until portal auth is wired, so today this attaches no header.
 */
export const saasTarget: BackendTarget = {
  baseUrl: "",
  async getAuthHeaders() {
    const headers: Record<string, string> = {};
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  },
};

// Single active target. When multiple self-hosted backends become real, a
// registry + selector slots in here (e.g. keyed by instance id). Call sites
// stay untouched because they go through getActiveTarget().
let activeTarget: BackendTarget = saasTarget;

export function getActiveTarget(): BackendTarget {
  return activeTarget;
}

export function setActiveTarget(target: BackendTarget): void {
  activeTarget = target;
}
