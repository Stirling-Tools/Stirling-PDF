/**
 * Desktop shadow of the proprietary Policies right-rail.
 *
 * Re-exports the proprietary module unchanged EXCEPT `usePoliciesEnabled`, which
 * additionally requires an active SaaS connection. Policy runs execute + bill via
 * the cloud (POST /api/v1/policies/.../run hits the SaaS backend), so on desktop
 * the feature must be hidden in local ("disconnected") and self-hosted modes —
 * otherwise the panel + auto-run controller would fire policy runs against a
 * backend that doesn't serve them. On web the build flavor already gates it.
 *
 * `usePoliciesEnabled` is the single gate RightSidebar uses for BOTH the rail
 * section and mounting PolicyAutoRunController, so this one override covers both.
 */
import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { useSaaSMode } from "@app/hooks/useSaaSMode";

export * from "@proprietary/components/policies/PoliciesSidebar";

export function usePoliciesEnabled(): boolean {
  // useSaaSMode() is true only when the desktop app is in SaaS connection mode.
  return POLICIES_ENABLED && useSaaSMode();
}
