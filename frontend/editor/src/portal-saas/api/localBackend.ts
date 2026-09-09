import { saasApiBase } from "@portal/api/saasApiBase";
import { getPortalSaasToken } from "@portal/auth/portalSaasSession";

/**
 * SaaS build: there is no separate local instance — {@code apiClient.local} IS the
 * SaaS backend. Route it at the one backend (VITE_API_BASE_URL, via saasApiBase)
 * with the admin's Supabase JWT, identical to {@code apiClient.saas}. So "local"
 * and "saas" calls both reach the SaaS backend authenticated; there is no
 * same-origin + Spring path on SaaS.
 */
export function localBaseUrl(): string {
  return saasApiBase();
}

export async function localAuthHeader(): Promise<Record<string, string>> {
  const token = await getPortalSaasToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function onLocalUnauthorized(): void {
  // No Spring token on SaaS; PortalAuthBoundary handles Supabase session expiry.
}
