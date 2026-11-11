import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Cloud editor builds open settings on the Plan section, which is where the
 * free grant is explained and the Processor plan is switched on. Routed, as
 * settings live at `/settings/*`, the same path the admin tour uses.
 */
export function useOpenPlan(): (() => void) | null {
  const navigate = useNavigate();
  return useCallback(() => navigate("/settings/plan"), [navigate]);
}
