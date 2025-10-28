/**
 * Utility functions for handling click events in navigation components
 */

/**
 * Determines if a click event is a "special" click that should use browser's default navigation
 * instead of SPA navigation. Special clicks include:
 * - Ctrl+click (or Cmd+click on Mac)
 * - Shift+click 
 * - Middle mouse button click
 */
export function isSpecialClick(e: React.MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1;
}

/**
 * Handles a click event for SPA navigation, but allows special clicks to use browser defaults
 * 
 * @param e - The click event
 * @param handleClick - Function to execute for regular clicks (SPA navigation)
 * @returns true if the event was handled as a special click, false if it was handled as regular click
 */
export function handleUnlessSpecialClick(e: React.MouseEvent, handleClick: () => void): boolean {
  if (isSpecialClick(e)) {
    return true; // Let browser handle via href
  }
  
  e.preventDefault();
  handleClick();
  return false;
}