/**
 * Get the base URL for API requests.
 * Core version uses simple environment variable.
 * Returns empty string to avoid double-slash issue with protocol-relative URLs.
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || '';
}
