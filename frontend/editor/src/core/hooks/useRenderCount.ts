/**
 * Dev-only render counter. Logs every render with a stable label so we can
 * eyeball excessive re-renders during PAYG Plan-page work. Counts to
 * {@code window.__renderCounts[label]} so a Playwright eval can assert
 * "Plan rendered ≤ 3 times after a wallet refetch."
 *
 * <p>In production builds {@code import.meta.env.DEV} is constant-folded to
 * {@code false}, so the module-level constant {@code IS_DEV} below allows
 * Vite's dead-code-elimination to drop the whole hook body — no extra refs,
 * no extra renders, no window pollution.
 */
import { useRef } from "react";

declare global {
  interface Window {
    __renderCounts?: Record<string, number>;
  }
}

const IS_DEV = import.meta.env.DEV;

export function useRenderCount(label: string): number {
  // useRef must run unconditionally to satisfy rules-of-hooks. In production
  // the rest of the body is dead-code-eliminated, leaving just this single
  // ref allocation.
  const count = useRef(0);
  if (!IS_DEV) return 0;
  count.current += 1;
  if (typeof window !== "undefined") {
    if (!window.__renderCounts) window.__renderCounts = {};
    window.__renderCounts[label] = count.current;
  }
  return count.current;
}
