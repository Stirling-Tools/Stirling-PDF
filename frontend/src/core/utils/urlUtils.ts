/**
 * Utility functions for handling URLs in both web and Tauri environments
 */

/**
 * Check if we're running in a Tauri desktop environment
 * @returns True if running in Tauri
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && 
    (window as any).__TAURI__ !== undefined;
}

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
  // Check if we're in Tauri environment
  if (isTauriEnvironment()) {
    // Use void to avoid returning Promise from this function
    void (async () => {
      try {
        // Dynamically import Tauri shell plugin only in Tauri environment
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
        return;
      } catch (error) {
        console.warn('[urlUtils] Failed to open URL with Tauri shell, falling back to window.open:', error);
        // Fall back to window.open if Tauri fails
        window.open(url, target, features);
      }
    })();
  } else {
    // Use standard window.open for web environment
    window.open(url, target, features);
  }
}

/**
 * Check if a URL protocol is safe to open
 * @param url - The URL to check
 * @returns True if the URL protocol is safe (http, https, mailto)
 */
export function isSafeUrlProtocol(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(urlObj.protocol);
  } catch {
    // If URL parsing fails, assume it's unsafe
    return false;
  }
}