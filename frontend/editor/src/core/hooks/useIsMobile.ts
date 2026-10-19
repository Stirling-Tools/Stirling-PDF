import { useState, useEffect } from "react";

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

export const useQueryMatch = (query: string): boolean => {
  const [matches, setMatches] = useState<boolean>(() => getInitialMatch(query));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    try {
      const mediaQuery = window.matchMedia(query);
      if (!mediaQuery) return;
      if (typeof mediaQuery.addEventListener === "function") {
        const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
      } else if (typeof (mediaQuery as { addListener?: (cb: (e: MediaQueryListEvent) => void) => void }).addListener === "function") {
        const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
        (mediaQuery as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(handler);
        return () => (mediaQuery as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(handler);
      }
    } catch {
      return undefined;
    }
  }, [query]);

  return matches;
};

export const useIsMobile = (): boolean => useQueryMatch("(max-width: 1024px)");

export const useIsPhone = (): boolean => useQueryMatch("(max-width: 768px)");

export const useIsTouch = (): boolean => useQueryMatch("(pointer: coarse)");
