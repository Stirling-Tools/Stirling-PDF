import { isTauri } from '@tauri-apps/api/core';

/**
 * Desktop override: Determine base URL depending on Tauri environment
 */
export function getApiBaseUrl(): string {
  if (!isTauri()) {
    return import.meta.env.VITE_API_BASE_URL || '/';
  }

  if (import.meta.env.DEV) {
    // During tauri dev we rely on Vite proxy, so use relative path to avoid CORS preflight
    return '/';
  }

  // In production builds the backend selects a free port dynamically.
  // Requests will be rewritten to the discovered port by the desktop interceptors.
  return '';
}
