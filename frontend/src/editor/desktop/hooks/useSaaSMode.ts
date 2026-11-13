import { useConnectionMode } from "@editor/hooks/useConnectionMode";

/**
 * Returns whether the app is currently in SaaS connection mode.
 * Cloud requests stay disabled until the saved connection mode is known.
 */
export function useSaaSMode(): boolean {
  return useConnectionMode() === "saas";
}
