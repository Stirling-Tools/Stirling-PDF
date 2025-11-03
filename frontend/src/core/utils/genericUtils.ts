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
