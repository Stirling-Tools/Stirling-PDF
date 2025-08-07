/**
 * DOM utility functions for common operations
 */

/**
 * Clamps a value between a minimum and maximum
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Safely adds an event listener with proper cleanup
 * @param target - The target element or window/document
 * @param event - The event type
 * @param handler - The event handler function
 * @param options - Event listener options
 * @returns A cleanup function to remove the listener
 */
export function addEventListenerWithCleanup(
  target: EventTarget,
  event: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions
): () => void {
  target.addEventListener(event, handler, options);
  return () => target.removeEventListener(event, handler, options);
}

/**
 * Checks if a click event occurred outside of a specified element
 * @param event - The click event
 * @param element - The element to check against
 * @returns True if the click was outside the element
 */
export function isClickOutside(event: MouseEvent, element: HTMLElement | null): boolean {
  return element ? !element.contains(event.target as Node) : true;
}

/**
 * Gets the sidebar rectangle for tooltip positioning
 * @returns Object containing the sidebar rect and whether it's the correct sidebar
 */
export function getSidebarRect(): { rect: DOMRect | null, isCorrectSidebar: boolean } {
  // Find the rightmost sidebar - this will be the "All Tools" expanded panel
  const allSidebars = [];

  // Find the QuickAccessBar (narrow left bar)
  const quickAccessBar = document.querySelector('[data-sidebar="quick-access"]');
  if (quickAccessBar) {
    const rect = quickAccessBar.getBoundingClientRect();
    if (rect.width > 0) {
      allSidebars.push({
        element: 'QuickAccessBar',
        selector: '[data-sidebar="quick-access"]',
        rect
      });
    }
  }

  // Find the tool panel (the expanded "All Tools" panel)  
  const toolPanel = document.querySelector('[data-sidebar="tool-panel"]');
  if (toolPanel) {
    const rect = toolPanel.getBoundingClientRect();
    if (rect.width > 0) {
      allSidebars.push({
        element: 'ToolPanel',
        selector: '[data-sidebar="tool-panel"]',
        rect
      });
    }
  }

  // Use the rightmost sidebar (which should be the tool panel when expanded)
  if (allSidebars.length > 0) {
    const rightmostSidebar = allSidebars.reduce((rightmost, current) => {
      return current.rect.right > rightmost.rect.right ? current : rightmost;
    });

    // Only consider it correct if we're using the ToolPanel (expanded All Tools sidebar)
    const isCorrectSidebar = rightmostSidebar.element === 'ToolPanel';

    console.log('✅ Tooltip positioning using:', {
      element: rightmostSidebar.element,
      selector: rightmostSidebar.selector,
      width: rightmostSidebar.rect.width,
      right: rightmostSidebar.rect.right,
      isCorrectSidebar,
      rect: rightmostSidebar.rect
    });

    return { rect: rightmostSidebar.rect, isCorrectSidebar };
  }

  console.warn('⚠️ No sidebars found, using fallback positioning');
  // Final fallback
  return { rect: new DOMRect(0, 0, 280, window.innerHeight), isCorrectSidebar: false };
} 