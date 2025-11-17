import { isTauri } from '@tauri-apps/api/core';

// Default backend URL from environment variables (fallback for production builds)
const DEFAULT_BACKEND_URL = import.meta.env.VITE_DESKTOP_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || '';

/**
 * Desktop override: Determine base URL depending on Tauri environment
 */
export function getApiBaseUrl(): string {
  if (!isTauri()) {
    return import.meta.env.VITE_API_BASE_URL || '/';
  }

  if (import.meta.env.DEV) {
    // During tauri dev we rely on Vite proxy, so use empty string to avoid double-slash issue
    // (baseURL "/" + url "/api/..." = "//api/..." which browsers treat as protocol-relative URL)
    return '';
  }

  return DEFAULT_BACKEND_URL;
}
