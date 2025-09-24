import { useAppConfig } from '../hooks/useAppConfig';

// Get base URL from app config with fallback
export const getBaseUrl = (): string => {
  const { config } = useAppConfig();
  return config?.baseUrl || 'https://stirling.com';
};

// Base path from Vite config - build-time constant, normalized (no trailing slash)
export const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

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
