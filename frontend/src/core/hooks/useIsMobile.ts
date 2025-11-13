import { useMediaQuery } from '@mantine/hooks';

/**
 * Custom hook to detect mobile viewport
 * Uses a consistent breakpoint across the application
 */
export const useIsMobile = (): boolean => {
  return useMediaQuery('(max-width: 1024px)') ?? false;
};
