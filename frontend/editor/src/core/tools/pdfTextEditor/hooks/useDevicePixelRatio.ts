import { useEffect, useState } from "react";

/**
 * The display's current devicePixelRatio, live. A `(resolution: Xdppx)` media
 * query matches exactly one ratio, so each change re-arms a fresh query -
 * that is what keeps the value tracking when the window moves to a monitor
 * with a different scale factor, or the user changes browser zoom.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    let query: MediaQueryList | null = null;
    let disposed = false;
    const arm = () => {
      if (disposed) return;
      const current = window.devicePixelRatio || 1;
      setDpr(current);
      query?.removeEventListener("change", arm);
      query = window.matchMedia(`(resolution: ${current}dppx)`);
      query.addEventListener("change", arm);
    };
    arm();
    return () => {
      disposed = true;
      query?.removeEventListener("change", arm);
    };
  }, []);

  return dpr;
}
