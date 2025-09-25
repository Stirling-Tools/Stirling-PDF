import { useAppConfig, type AppConfig } from '../hooks/useAppConfig';

// Get base URL from app config with fallback
export const DEFAULT_BASE_URL = 'https://stirling.com';

export const getBaseUrlFromConfig = (config?: AppConfig | null): string =>
  config?.baseUrl ?? DEFAULT_BASE_URL;

// Hook to access the base URL within React components
export const useBaseUrl = (): string => {
  const { config } = useAppConfig();
  return getBaseUrlFromConfig(config);
};

// Base path from Vite config - build-time constant, normalized (no trailing slash)
// When no subpath, use empty string instead of '.' to avoid relative path issues
export const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/$/, '').replace(/^\.$/, '');

/** For in-app navigations when you must touch window.location (rare). */
export const withBasePath = (path: string): string => {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${clean}`;
};

/** For OAuth (needs absolute URL with scheme+host) */
export const absoluteWithBasePath = (path: string): string => {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}${BASE_PATH}${clean}`;
};
