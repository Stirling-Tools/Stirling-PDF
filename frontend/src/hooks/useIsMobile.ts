import { useEffect, useState } from "react";

/**
 * Small responsive helper for determining when the UI should switch to the
 * mobile layout. Uses a matchMedia listener so it stays in sync with viewport
 * changes without forcing re-renders on every resize event.
 */
export function useIsMobile(maxWidth = 960): boolean {
  const getMatches = () =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false;

  const [isMobile, setIsMobile] = useState<boolean>(getMatches());

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    // Initial sync in case the component mounted before React read the value
    setIsMobile(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [maxWidth]);

  return isMobile;
}

export default useIsMobile;
