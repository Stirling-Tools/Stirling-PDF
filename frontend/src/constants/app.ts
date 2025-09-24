import { useAppConfig, type AppConfig } from '../hooks/useAppConfig';

// Get base URL from app config with fallback
export const DEFAULT_BASE_URL = 'https://stirling.com';

export const getBaseUrlFromConfig = (config?: AppConfig | null): string =>
  config?.baseUrl || DEFAULT_BASE_URL;

// Hook to access the base URL within React components
export const useBaseUrl = (): string => {
  const { config } = useAppConfig();
  return getBaseUrlFromConfig(config);
};
