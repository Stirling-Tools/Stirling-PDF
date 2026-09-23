import type { MouseEvent } from "react";
import { openExternal } from "@app/platform/openExternal";

/**
 * Desktop (Tauri) override of the @app/platform/externalLinkClick seam.
 *
 * The app runs inside a Tauri webview, which traps a `target="_blank"` anchor
 * inside our own window. Intercept the click and hand the URL to the OS browser
 * via the openExternal seam (Tauri shell open) so the link lands in the user's
 * real browser.
 */
export function handleExternalLinkClick(
  url: string,
  event: MouseEvent<HTMLElement>,
): void {
  event.preventDefault();
  void openExternal(url);
}
