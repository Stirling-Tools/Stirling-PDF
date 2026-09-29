/**
 * Base URL for attended portal→SaaS reads ({@code apiClient.saas}) — the seam the
 * SaaS build overrides.
 *
 * <p>Self-hosted (this base): the SaaS cloud is a <em>separate</em> backend from
 * this instance's local one, configured via {@code VITE_SAAS_API_URL}. Returns
 * {@code null} when unset so {@code apiClient.saas} can surface a clear
 * "configure" state. A set value has any trailing slash trimmed.
 *
 * <p>The SaaS build shadows this to reuse the editor's single backend
 * ({@code VITE_API_BASE_URL}) — in SaaS everything is the SaaS backend, so there
 * is no separate SaaS URL.
 */
export function saasApiBase(): string | null {
  const raw = import.meta.env.VITE_SAAS_API_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}
