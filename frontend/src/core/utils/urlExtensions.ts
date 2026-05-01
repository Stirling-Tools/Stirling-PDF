/**
 * Extension point for URL handling
 * Core provides web implementation, desktop overrides with Tauri implementation
 */

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
  // Core implementation - web environment
  window.open(url, target, features);
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