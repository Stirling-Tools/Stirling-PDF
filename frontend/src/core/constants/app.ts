
// Base path - read from <base> tag at runtime to support dynamic subpaths
// Falls back to Vite's BASE_URL for build-time subpaths
// Normalized: no trailing slash, empty string instead of '.' or '/'
function getBasePath(): string {
  // Try to read from <base> tag first (runtime subpath support)
  if (typeof document !== 'undefined') {
    const baseElement = document.querySelector('base');
    if (baseElement) {
      const href = baseElement.getAttribute('href');
      if (href && href !== '%BASE_URL%') {
        return href.replace(/\/$/, '').replace(/^\.$/, '').replace(/^\/$/, '');
      }
    }
  }

  // Fall back to Vite's BASE_URL (build-time subpath)
  return (import.meta.env.BASE_URL || '/').replace(/\/$/, '').replace(/^\.$/, '').replace(/^\/$/, '');
}

export const BASE_PATH = getBasePath();

// EmbedPDF needs time to remove annotations internally before a recreation runs.
// Without the buffer we occasionally end up with duplicate annotations or stale image data.
export const ANNOTATION_RECREATION_DELAY_MS = 50;
export const ANNOTATION_VERIFICATION_DELAY_MS = 100;

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
