import { connectionModeService } from "@editor/services/connectionModeService";

/**
 * The self-hosted server this app is signed in to. The webview's own origin
 * (http://tauri.localhost on Windows) is the app, not the server, so it must
 * never be offered.
 */
export function setupAddressPrefill(): string {
  const url = connectionModeService.getCachedServerConfig()?.url ?? "";
  return /^https?:\/\//.test(url) ? url.replace(/\/+$/, "") : "";
}
