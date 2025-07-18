const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';


export const makeApiUrl = (endpoint: string): string => {
  const baseUrl = apiBaseUrl;
  
  // If baseUrl is empty (development), return endpoint as-is for proxy
  if (!baseUrl) {
    return endpoint;
  }
  
  // For production, combine base URL with endpoint
  return `${baseUrl}${endpoint}`;
};