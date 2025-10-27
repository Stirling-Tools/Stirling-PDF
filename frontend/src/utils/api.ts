import { isTauri } from '@tauri-apps/api/core';

// Runtime configuration access
declare global {
  interface Window {
    runtimeConfig?: {
      apiBaseUrl?: string;
    };
  }
}

export const makeApiUrl = (endpoint: string): string => {

  //const baseUrl = window.runtimeConfig?.apiBaseUrl || 'http://localhost:8080';

  if (isTauri()) {
    // If running in Tauri, use the Tauri API base URL
    const tauriApiBaseUrl = 'http://localhost:8080';
    return `${tauriApiBaseUrl}${endpoint}`;
  }


  return endpoint;
};