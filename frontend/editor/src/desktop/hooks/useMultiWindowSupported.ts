import { useEffect, useState } from "react";
import { getDesktopOs, DesktopOs } from "@app/services/platformService";

/**
 * Whether multiple windows are supported on the current OS.
 *
 * Multi-window relies on every window sharing one persistent web store, so a
 * new window sees the same login / files / settings:
 *  - Windows: shared WebView2 user-data dir ✅
 *  - macOS: shared WKWebsiteDataStore.default() ✅
 *  - Linux: WebKitGTK gives each window its own store and Tauri exposes no way
 *    to share it, so a new window would start blank. Multi-window is disabled
 *    there.
 *
 * Uses an allowlist of known-good platforms, so anything unresolved (null) or
 * unknown (detection failed) stays disabled rather than risking a blank window.
 */
export function useMultiWindowSupported(): boolean {
  const [os, setOs] = useState<DesktopOs | null>(null);

  useEffect(() => {
    getDesktopOs()
      .then(setOs)
      .catch(() => setOs(DesktopOs.Unknown));
  }, []);

  return os === DesktopOs.Windows || os === DesktopOs.Mac;
}
