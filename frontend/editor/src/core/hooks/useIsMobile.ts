import { useMediaQuery } from "@mantine/hooks";

const getInitialMatch = (query: string): boolean => {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    try {
      return Boolean(window.matchMedia(query)?.matches);
    } catch {
      return false;
    }
  }
  return false;
};

export const useIsMobile = (): boolean => {
  const query = "(max-width: 1024px)";
  return useMediaQuery(query, getInitialMatch(query)) ?? false;
};

export const useIsPhone = (): boolean => {
  const query = "(max-width: 768px)";
  return useMediaQuery(query, getInitialMatch(query)) ?? false;
};

export const useIsTouch = (): boolean => {
  const query = "(pointer: coarse)";
  return useMediaQuery(query, getInitialMatch(query)) ?? false;
};
