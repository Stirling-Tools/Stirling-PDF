/**
 * Sanitisation for URLs that come out of a PDF (link annotations, bookmark
 * actions). PDF-supplied URIs are untrusted input, so everything that opens one
 * funnels through here first and drops anything outside the allowlist.
 *
 * Pure helpers only — opening the URL is a platform concern and lives behind
 * the @app/platform/openExternalTab seam.
 */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function getExternalUrlBase(): string | undefined {
  // Relative URIs resolve against the app's own location, matching how the
  // viewer has always treated them. No DOM => absolute URLs only.
  return typeof window !== "undefined" ? window.location?.href : undefined;
}

/** Parses `rawUrl` and returns it only if its protocol is on the allowlist. */
export function toSafeExternalUrl(rawUrl: string): URL | null {
  // An empty URI would otherwise resolve to the app's own page via the base.
  if (!rawUrl?.trim()) return null;
  try {
    const parsed = new URL(rawUrl, getExternalUrlBase());
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

/** Normalised href for a safe external URL, or null if it is not safe to open. */
export function getExternalHref(rawUrl: string): string | null {
  return toSafeExternalUrl(rawUrl)?.href ?? null;
}
