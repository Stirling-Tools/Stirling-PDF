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
