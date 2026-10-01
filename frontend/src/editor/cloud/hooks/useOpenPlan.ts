import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Cloud editor builds open the settings modal on its Plan section, which is
 * where the free grant is explained and the Processor plan is switched on.
 * Routed rather than called directly because the modal is URL-driven here
 * (`/settings/*`), the same path the admin tour uses to open it.
 */
export function useOpenPlan(): (() => void) | null {
  const navigate = useNavigate();
  return useCallback(() => navigate("/settings/plan"), [navigate]);
}
