/**
 * SaaS build: everything is the SaaS backend, so portal→SaaS reads target the
 * SAME base URL the editor uses ({@code VITE_API_BASE_URL}) rather than a separate
 * {@code VITE_SAAS_API_URL}. Default {@code "/"} → same-origin (the dev proxy /
 * deployment forwards to the SaaS backend); the Supabase JWT is the one credential.
 *
 * <p>Never null — same-origin is always a valid base — so {@code apiClient.saas}
 * never enters the self-hosted "SaaS not configured" state.
 */
export function saasApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL ?? "/";
  return raw.replace(/\/+$/, "");
}
