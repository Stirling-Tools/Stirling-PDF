export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  
  // In development, use empty string to leverage Vite proxy
  // In production/Tauri, use localhost:8080 directly
  // if (envUrl !== undefined) {
  //   console.log(`Using API base URL from environment: ${envUrl}`);
  //   return envUrl;
  // }
  
  // Fallback for development
  console.log('Using default API base URL: http://localhost:8080');
  return 'http://localhost:8080';
};

export const makeApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  
  // If baseUrl is empty (development), return endpoint as-is for proxy
  if (!baseUrl) {
    return endpoint;
  }
  
  // For production, combine base URL with endpoint
  return `${baseUrl}${endpoint}`;
};