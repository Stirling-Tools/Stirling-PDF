import type { MouseEvent } from "react";

/**
 * Click handler for external `<a target="_blank">` links rendered by shared
 * components (e.g. UpdateModal release notes / migration guides).
 *
 * In a normal browser a `target="_blank"` anchor already opens the URL in a new
 * tab, so this default does nothing and lets the native navigation proceed.
 * Builds whose webview traps `target="_blank"` inside the app window shadow this
 * module to intercept the click and route the URL to the OS browser instead.
 */
export function handleExternalLinkClick(
  _url: string,
  _event: MouseEvent<HTMLElement>,
): void {}
