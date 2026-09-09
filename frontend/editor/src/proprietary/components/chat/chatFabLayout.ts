// Pure layout/geometry for the draggable ChatFAB panel. Kept free of React so
// the constants and clamping math stay readable and unit-testable; ChatFAB.tsx
// owns the stateful wiring (refs, effects, the ResizeObserver) that consumes them.

export const PANEL_WIDTH_PX = 390;
export const PANEL_HEIGHT_PX = 520;
export const PANEL_MIN_WIDTH_PX = 300;
export const PANEL_MIN_HEIGHT_PX = 380;
export const FAB_GAP_PX = 16;
const FAB_BOTTOM_OFFSET_PX = FAB_GAP_PX;

export const RESET_MS = 380;
const RESET_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
export const RESET_TRANSITION = `transform ${RESET_MS}ms ${RESET_EASING}, width ${RESET_MS}ms ${RESET_EASING}, height ${RESET_MS}ms ${RESET_EASING}`;

// Handle strips straddle the border; zIndex:1 lifts them above ChatFABWindow's transform stacking context.
export const RESIZE_HANDLES = {
  top: { top: -3, left: 14, right: 14, height: 6, zIndex: 1 },
  bottom: { bottom: -3, left: 14, right: 14, height: 6, zIndex: 1 },
  left: { left: -3, top: 14, bottom: 14, width: 6, zIndex: 1 },
  right: { right: -3, top: 14, bottom: 14, width: 6, zIndex: 1 },
  topLeft: { top: -4, left: -4, width: 14, height: 14, zIndex: 1 },
  topRight: { top: -4, right: -4, width: 14, height: 14, zIndex: 1 },
  bottomLeft: { bottom: -4, left: -4, width: 14, height: 14, zIndex: 1 },
  bottomRight: { bottom: -4, right: -4, width: 14, height: 14, zIndex: 1 },
};

// Default resting position: bottom-right of the overlay, inset by the gap.
export function defaultPanelPos(
  overlayWidth: number,
  overlayHeight: number,
): { x: number; y: number } {
  return {
    x: overlayWidth - PANEL_WIDTH_PX - FAB_GAP_PX,
    y: overlayHeight - PANEL_HEIGHT_PX - FAB_BOTTOM_OFFSET_PX,
  };
}

// Clamps pos to [gap, max] on each axis; pins to top-left gap when the overlay is too small so the header stays reachable.
export function clampToOverlay(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  overlayWidth: number,
  overlayHeight: number,
): { x: number; y: number } {
  const maxX = overlayWidth - size.width - FAB_GAP_PX;
  const maxY = overlayHeight - size.height - FAB_GAP_PX;
  return {
    x: Math.max(FAB_GAP_PX, Math.min(pos.x, maxX)),
    y: Math.max(FAB_GAP_PX, Math.min(pos.y, maxY)),
  };
}
