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
import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";

export * from "@proprietary/components/policies/PoliciesSidebar";

export function usePoliciesEnabled(): boolean {
  // Pessimistic SaaS-mode check (starts false): this gate also controls whether
  // PolicyAutoRunController mounts, and that fires GET /api/v1/policies on mount.
  // useSaaSMode()'s optimistic-true default would leak that request against the
  // local/self-hosted backend on cold start before the mode resolves.
  return POLICIES_ENABLED && useConfirmedSaaSMode();
}
