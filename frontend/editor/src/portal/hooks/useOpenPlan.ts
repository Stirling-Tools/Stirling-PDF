import { useCallback } from "react";
import { useUI } from "@portal/contexts/UIContext";

/**
 * Self-hosted processor: settings carries no cloud Plan section, so the
 * footer's credits row opens the Usage & Billing settings section — the same
 * figures, on the surface this flavor actually owns.
 */
export function useOpenPlan(): (() => void) | null {
  const { openSettings } = useUI();
  return useCallback(() => openSettings("billing"), [openSettings]);
}
