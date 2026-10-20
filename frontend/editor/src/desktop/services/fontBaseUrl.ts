import { tauriBackendService } from "@app/services/tauriBackendService";

/**
 * Desktop shadow: the webview has no /fonts of its own, but the bundled backend
 * runs in every connection mode and serves the font set from the JAR. Empty
 * while the backend port is still unknown; the engine then falls back to
 * same-origin URLs, which fail gracefully.
 */
export function getFontBaseUrl(): string {
  const base = tauriBackendService.getBackendUrl();
  return base ? `${base.replace(/\/$/, "")}/fonts` : "";
}

/**
 * The webview learns the backend port after startup, so the base URL moves from
 * empty to a real origin. Consumers memoize the font config; this lets them
 * recompute it, but only when the resolved URL actually changes so an unrelated
 * health flap does not churn the engine.
 */
export function subscribeToFontBaseUrl(onChange: () => void): () => void {
  let previous = getFontBaseUrl();
  return tauriBackendService.subscribeToStatus(() => {
    const next = getFontBaseUrl();
    if (next === previous) return;
    previous = next;
    onChange();
  });
}
