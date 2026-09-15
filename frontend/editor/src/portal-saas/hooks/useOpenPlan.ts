import { useCallback } from "react";
import { useUI } from "@portal/contexts/UIContext";

/**
 * SaaS processor: the settings modal it hosts carries the same Plan section the
 * editor opens, so the footer's credits row lands both apps in one place.
 */
export function useOpenPlan(): (() => void) | null {
  const { openSettings } = useUI();
  return useCallback(() => openSettings("plan"), [openSettings]);
}
