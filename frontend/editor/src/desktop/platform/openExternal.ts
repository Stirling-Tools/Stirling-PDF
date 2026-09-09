/**
 * desktop (Tauri) implementation of the @app/platform/openExternal seam.
 *
 * The app runs inside a Tauri webview, so window.open would trap the URL in our
 * own window. We hand it to the OS via the Tauri shell plugin's open() instead
 * — the same mechanism authService.openInSystemBrowser already uses — so the
 * link lands in the user's real browser.
 */
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import type { OpenExternal } from "@cloud/platform/openExternal";

export const openExternal: OpenExternal = async (
  url: string,
): Promise<void> => {
  await shellOpen(url);
};
