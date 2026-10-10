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
  if (typeof window === "undefined") {
    // No origin to resolve against; a root-relative path is still usable.
    return `${apiBase.startsWith("/") ? apiBase : `/${apiBase}`}/fonts`;
  }
  // Resolve against the origin so a slashless base ("api") stays a path under
  // the host instead of gluing onto the hostname ("https://hostapi").
  const resolved = new URL(apiBase, `${window.location.origin}/`);
  return `${resolved.origin}${resolved.pathname.replace(/\/$/, "")}/fonts`;
}

/**
 * Subscribe to font-base-URL changes. The web app knows its base at module
 * load, so there is nothing to watch; the desktop shadow fires when the bundled
 * backend's port is discovered and the base stops being empty.
 */
export function subscribeToFontBaseUrl(_onChange: () => void): () => void {
  return () => {};
}
