/**
 * Desktop-specific workspace tab shortcuts.
 * In desktop mode, we can safely use Ctrl+Tab because we don't conflict with a browser UI.
 */
export function handleCustomTabShortcuts(e: KeyboardEvent): { nextTab: boolean; prevTab: boolean } {
  let nextTab = false;
  let prevTab = false;
  
  if (e.key === "Tab" && e.ctrlKey && !e.shiftKey) {
    nextTab = true;
  } else if (e.key === "Tab" && e.ctrlKey && e.shiftKey) {
    prevTab = true;
  }
  
  return { nextTab, prevTab };
}
