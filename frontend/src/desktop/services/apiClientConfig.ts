import { isTauri } from '@tauri-apps/api/core';

/**
 * Desktop override: Determine base URL depending on Tauri environment
 *
 * Note: In Tauri mode, the actual URL is determined dynamically by operationRouter
 * based on connection mode and backend port. This initial baseURL is overridden
 * by request interceptors in apiClientSetup.ts.
 */
export function getApiBaseUrl(): string {
  if (!isTauri()) {
    return import.meta.env.VITE_API_BASE_URL || '/';
  }

  // In Tauri mode, return empty string as placeholder
  // The actual URL will be set dynamically by operationRouter based on:
  // - Offline mode: dynamic port from tauriBackendService
  // - Server mode: configured server URL from connectionModeService
  return '';
}
