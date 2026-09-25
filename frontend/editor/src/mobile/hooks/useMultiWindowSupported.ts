/**
 * Mobile has exactly one window: iOS and Android webviews cannot open a second
 * Tauri window, so every "open in new window" affordance is hidden.
 */
export function useMultiWindowSupported(): boolean {
  return false;
}
