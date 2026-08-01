/**
 * desktop (Tauri) implementation of the @app/platform/openExternalTab seam.
 *
 * window.open would trap the URL inside our own webview, so hand it to the OS.
 * Delegates to the openExternal seam rather than calling the Tauri shell plugin
 * again — on desktop "new tab" and "system browser" are the same action.
 */
import { openExternal } from "@app/platform/openExternal";
import type { OpenExternalTab } from "@core/platform/openExternalTab";

export const openExternalTab: OpenExternalTab = async (
  url: string,
): Promise<void> => {
  await openExternal(url);
};
