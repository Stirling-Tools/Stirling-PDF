/**
 * Dev-only render counter. Logs every render with a stable label so we can
 * eyeball excessive re-renders during PAYG Plan-page work. Counts to
 * {@code window.__renderCounts[label]} so a Playwright eval can assert
 * "Plan rendered ≤ 3 times after a wallet refetch."
 *
 * <p>In production builds it short-circuits to a no-op — no extra renders, no
 * window pollution.
 */
import { useRef } from "react";

declare global {
  interface Window {
    __renderCounts?: Record<string, number>;
  }
}

export function useRenderCount(label: string): number {
  const count = useRef(0);
  if (!import.meta.env.DEV) return 0;
  count.current += 1;
  if (typeof window !== "undefined") {
    if (!window.__renderCounts) window.__renderCounts = {};
    window.__renderCounts[label] = count.current;
  }
  return count.current;
}
