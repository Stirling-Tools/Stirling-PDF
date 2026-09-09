import { clearStoredToken, getStoredToken } from "@app/auth";

/**
 * Transport config for {@code apiClient.local} — the flavor seam behind "this
 * instance's backend".
 *
 * Self-hosted (this base): same-origin (the local Stirling backend, vite-proxied
 * to :8080 in dev), authenticated with the Spring admin bearer.
 *
 * The SaaS build shadows this file: there is no separate local instance, so
 * {@code apiClient.local} targets the one SaaS backend (VITE_API_BASE_URL, via
 * saasApiBase) with the admin's Supabase JWT — the same transport as
 * {@code apiClient.saas}. There is no same-origin + Spring path in SaaS.
 */
export function localBaseUrl(): string {
  return "";
}

/** Auth header for apiClient.local — the Spring admin bearer, when present. */
export async function localAuthHeader(): Promise<Record<string, string>> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Called on a 401 from apiClient.local. Self-hosted: drop the stale Spring token
 * so the auth provider re-initialises and shows the login screen rather than
 * leaving the user stuck with a banner.
 */
export function onLocalUnauthorized(): void {
  clearStoredToken();
  window.dispatchEvent(new CustomEvent("jwt-available"));
}
