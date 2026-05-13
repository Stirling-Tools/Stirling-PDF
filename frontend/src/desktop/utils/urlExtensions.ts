/**
 * Desktop override for URL handling
 * Uses Tauri's shellOpen for opening URLs in system browser
 */

import { open as shellOpen } from '@tauri-apps/plugin-shell';

/**
 * Open a URL in the appropriate way for the current environment
 * @param url - The URL to open
 * @param target - The target window (default: "_blank")
 * @param features - Window features (default: "noopener,noreferrer")
 */
export function openUrl(
  url: string, 
  target: string = "_blank", 
  features: string = "noopener,noreferrer"
): void {
  // Desktop implementation - use Tauri shellOpen
  void (async () => {
    try {
      await shellOpen(url);
    } catch (error) {
      console.warn('[urlExtensions] Failed to open URL with Tauri shell, falling back to window.open:', error);
      // Fall back to window.open if Tauri fails
      window.open(url, target, features);
    }
  })();
}

// Re-export isSafeUrlProtocol from core
export { isSafeUrlProtocol } from '@core/utils/urlExtensions';