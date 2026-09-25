/**
 * desktop (Tauri) implementation of the @app/platform/openExternalTab seam.
 *
 * window.open would trap the URL inside our own webview, so hand it to the OS.
 * Delegates to the openExternal seam rather than calling the Tauri shell plugin
 * again — on desktop "new tab" and "system browser" are the same action.
 *
 * Re-checks the URL for the same reason the core impl does, and more so: here it
 * reaches an OS handler, so an unvalidated scheme is not confined to a browser.
 */
import { openExternal } from "@app/platform/openExternal";
import type { OpenExternalTab } from "@core/platform/openExternalTab";
import { getExternalHref } from "@core/utils/externalUrl";

export const openExternalTab: OpenExternalTab = async (
  url: string,
): Promise<void> => {
  const safeHref = getExternalHref(url);
  if (!safeHref) {
    console.warn("[openExternalTab] Refused to open unsafe URL:", url);
    return;
  }
  await openExternal(safeHref);
};
