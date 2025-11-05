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

  return import.meta.env.VITE_DESKTOP_BACKEND_URL || 'http://localhost:8080';
}
