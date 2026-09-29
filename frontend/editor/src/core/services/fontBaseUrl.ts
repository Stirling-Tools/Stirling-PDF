import { getApiBaseUrl } from "@app/services/apiClientConfig";
import { BASE_PATH } from "@app/constants/app";

/**
 * Base URL for the PDFium fallback fonts. The backend serves the TrueType set
 * from the JAR at /fonts/**, so the frontend bundle carries no copy of it. The
 * API base already includes any context-path prefix.
 *
 * Must stay absolute: the engine resolves it inside a blob-based worker, where
 * a root-relative path would resolve against the blob URL and fail to load.
 */
export function getFontBaseUrl(): string {
  // Env-less contexts (Storybook, bare builds) leave the API base unset; the
  // web app serves fonts from its own root then.
  const apiBase = (getApiBaseUrl() || BASE_PATH).replace(/\/$/, "");
  if (/^https?:\/\//i.test(apiBase)) {
    return `${apiBase}/fonts`;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${apiBase}/fonts`;
}
