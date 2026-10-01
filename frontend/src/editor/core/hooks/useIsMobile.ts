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
 * Custom hook to detect a coarse pointer (touch device)
 * Use to gate touch-only UI hints when combined with useIsMobile
 */
export const useIsTouch = (): boolean => {
  return useMediaQuery("(pointer: coarse)") ?? false;
};
