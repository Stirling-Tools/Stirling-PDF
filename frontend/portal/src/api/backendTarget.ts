import { getAccessToken } from "@portal/auth/session";

export interface BackendTarget {
  baseUrl: string;
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Fetch credentials mode. "include" sends the session cookie. */
  credentials?: RequestCredentials;
}

/**
 * A self-hosted Stirling instance. The portal is admin-only and rides the
 * admin's existing server session: sending credentials carries the session
 * cookie, and the server authorizes (403 for non-admins). No header to attach.
 * baseUrl is "" so dev requests go same-origin and the proxy forwards them to
 * the server; a remote instance would set its origin here (and need CORS with
 * credentials).
 */
export const selfHostedTarget: BackendTarget = {
  baseUrl: "",
  credentials: "include",
  async getAuthHeaders() {
    return {};
  },
};

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

// Single active target. Self-hosted for now (local testing); SaaS lands later.
// When multiple self-hosted backends become real, a registry + selector slots
// in here (e.g. keyed by instance id). Call sites stay untouched because they
// go through getActiveTarget().
let activeTarget: BackendTarget = selfHostedTarget;

export function getActiveTarget(): BackendTarget {
  return activeTarget;
}

export function setActiveTarget(target: BackendTarget): void {
  activeTarget = target;
}
