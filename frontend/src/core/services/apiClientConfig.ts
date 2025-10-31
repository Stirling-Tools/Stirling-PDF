/**
 * Get the base URL for API requests.
 * Core version uses simple environment variable.
 * Desktop builds override this to handle Tauri-specific logic.
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || '/';
}
