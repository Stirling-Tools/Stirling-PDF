
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
