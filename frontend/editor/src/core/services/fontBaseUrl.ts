import { getApiBaseUrl } from "@app/services/apiClientConfig";

/**
 * Base URL for the PDFium fallback fonts. The backend serves the TrueType set
 * from the JAR at /fonts/**, so the frontend bundle carries no copy of it. The
 * API base already includes any context-path prefix.
 *
 * Must stay absolute: the engine resolves it inside a blob-based worker, where
 * a root-relative path would resolve against the blob URL and fail to load.
 */
export function getFontBaseUrl(): string {
  const apiBase = getApiBaseUrl().replace(/\/$/, "");
  if (/^https?:\/\//i.test(apiBase)) {
    return `${apiBase}/fonts`;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${apiBase}/fonts`;
}
