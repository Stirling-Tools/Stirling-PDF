import { connectionModeService } from "@editor/services/connectionModeService";

/** The self-hosted server this app is signed in to; the webview's own origin
 *  (http://tauri.localhost on Windows) is the app, never the server. */
export function setupAddressPrefill(): string {
  const url = connectionModeService.getCachedServerConfig()?.url ?? "";
  return /^https?:\/\//.test(url) ? url.replace(/\/+$/, "") : "";
}
