/**
 * Guarded client-side navigation for URLs that arrive as data (tool registry
 * links, search index entries, flavor config) rather than literals. The
 * values are trusted today, but funnelling them through a scheme allowlist
 * means a poisoned or mistyped entry (`javascript:…`) can never become a
 * script-execution sink.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/** The URL resolved against the current origin, or null if unparseable or a
 * non-web scheme (javascript:, data:, …). */
export function toSafeWebUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return null;
  }
  return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed : null;
}

/** window.open in a new tab, dropped silently for non-web schemes. */
export function openExternalUrl(url: string): void {
  const safe = toSafeWebUrl(url);
  if (safe) window.open(safe.href, "_blank", "noopener,noreferrer");
}

/**
 * Full-page navigation (window.location), dropped for non-web schemes. The
 * guard is scheme-only: cross-origin http(s) targets pass by design (a
 * separately-hosted editor is configured build-time via VITE_EDITOR_URL), so
 * callers must pass build/config values — never user-supplied input, which
 * could redirect anywhere on the web.
 */
export function assignLocation(url: string): void {
  const safe = toSafeWebUrl(url);
  if (safe) window.location.assign(safe.href);
}
