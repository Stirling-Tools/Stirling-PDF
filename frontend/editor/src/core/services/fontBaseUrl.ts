import { getApiBaseUrl } from "@app/services/apiClientConfig";

/**
 * Base URL for the PDFium fallback fonts. The backend serves the TrueType set
 * from the JAR at /fonts/**, so the frontend bundle carries no copy of it. The
 * API base already includes any context-path prefix.
 */
export function getFontBaseUrl(): string {
  return `${getApiBaseUrl().replace(/\/$/, "")}/fonts`;
}
