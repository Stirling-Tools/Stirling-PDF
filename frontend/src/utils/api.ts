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

  if (typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__)) {
    // If running in Tauri, use the Tauri API base URL
    const tauriApiBaseUrl = 'http://localhost:8080';
    return `${tauriApiBaseUrl}${endpoint}`;
  }
  

  return `${endpoint}`;
};