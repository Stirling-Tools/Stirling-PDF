// Runtime configuration access
declare global {
  interface Window {
    runtimeConfig?: {
      apiBaseUrl?: string;
    };
  }
}

export const makeApiUrl = (endpoint: string): string => {
  const baseUrl = window.runtimeConfig?.apiBaseUrl || 'http://localhost:8080';
  // For production, combine base URL with endpoint
  return `${baseUrl}${endpoint}`;
};