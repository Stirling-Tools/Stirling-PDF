import { isTauri } from '@tauri-apps/api/core';

/**
 * Desktop override: Determine base URL depending on Tauri environment
 *
 * Priority (non-Tauri mode):
 * 1. window.STIRLING_PDF_API_BASE_URL (runtime override - fixes hardcoded localhost issues)
 * 2. import.meta.env.VITE_API_BASE_URL (build-time env var)
 * 3. '/' (relative path - works for same-origin deployments)
 *
 * Note: In Tauri mode, the actual URL is determined dynamically by operationRouter
 * based on connection mode and backend port. This initial baseURL is overridden
 * by request interceptors in apiClientSetup.ts.
 */
export function getApiBaseUrl(): string {
  if (!isTauri()) {
    // Runtime override to fix hardcoded localhost in builds
    if (typeof window !== 'undefined' && (window as any).STIRLING_PDF_API_BASE_URL) {
      return (window as any).STIRLING_PDF_API_BASE_URL;
    }

    return import.meta.env.VITE_API_BASE_URL || '/';
  }

  // In Tauri mode, return empty string as placeholder
  // The actual URL will be set dynamically by operationRouter based on:
  // - Offline mode: dynamic port from tauriBackendService
  // - Server mode: configured server URL from connectionModeService
  return '';
}
