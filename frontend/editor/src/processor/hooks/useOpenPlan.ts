import { useCallback } from "react";
import { useView } from "@processor/contexts/ViewContext";

/**
 * Self-hosted processor: settings carries no Plan section (it is a cloud
 * surface, and this build's registry has none), so the footer's credits row
 * opens the processor's own Usage & Billing view instead — the same figures, on
 * the surface this flavor actually owns.
 */
export function useOpenPlan(): (() => void) | null {
  const { setActiveView } = useView();
  return useCallback(() => setActiveView("usage"), [setActiveView]);
}
