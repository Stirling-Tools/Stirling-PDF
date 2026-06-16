/**
 * Extension point for custom workspace tab shortcuts.
 * The core build provides no additional shortcuts, relying on web defaults.
 */
export function handleCustomTabShortcuts(e: KeyboardEvent): { nextTab: boolean; prevTab: boolean } {
  return { nextTab: false, prevTab: false };
}
