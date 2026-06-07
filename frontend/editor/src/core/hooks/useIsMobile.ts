import { useMediaQuery } from "@mantine/hooks";

/**
 * Custom hook to detect mobile viewport
 * Uses a consistent breakpoint across the application
 */
export const useIsMobile = (): boolean => {
  return useMediaQuery("(max-width: 1024px)") ?? false;
};

/**
 * Custom hook to detect phone-sized viewport (≤768px)
 * Use for layouts that need a more compact single-column arrangement
 */
export const useIsPhone = (): boolean => {
  return useMediaQuery("(max-width: 768px)") ?? false;
};

/**
 * Custom hook to detect a coarse pointer (touch device).
 * Use this in combination with `useIsMobile` to gate touch-only UI hints
 * (e.g. "Swipe left or right to switch views") so a desktop user with a
 * narrowed browser window doesn't see an unactionable swipe prompt.
 */
export const useIsTouch = (): boolean => {
  return useMediaQuery("(pointer: coarse)") ?? false;
};
