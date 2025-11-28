/**
 * Get the base URL for API requests.
 *
 * Priority:
 * 1. window.STIRLING_PDF_API_BASE_URL (runtime override - fixes hardcoded localhost issues)
 * 2. import.meta.env.VITE_API_BASE_URL (build-time env var)
 * 3. '/' (relative path - works for same-origin deployments)
 *
 * Note: Runtime override is needed because VITE_API_BASE_URL gets baked into the build.
 * If someone builds with VITE_API_BASE_URL=http://localhost:8080, it breaks production deployments.
 */
export function getApiBaseUrl(): string {
  // Runtime override to fix hardcoded localhost in builds
  if (typeof window !== 'undefined' && (window as any).STIRLING_PDF_API_BASE_URL) {
    return (window as any).STIRLING_PDF_API_BASE_URL;
  }

  return import.meta.env.VITE_API_BASE_URL || '/';
}
