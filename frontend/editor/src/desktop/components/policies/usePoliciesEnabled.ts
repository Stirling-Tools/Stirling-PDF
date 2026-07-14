import { POLICIES_ENABLED } from "@app/constants/featureFlags";
import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";

/**
 * Desktop shadow: policy runs execute + bill via the cloud (POST
 * /api/v1/policies/.../run hits the SaaS backend), so the feature must stay
 * off in local ("disconnected") and self-hosted modes — otherwise the
 * auto-run controller would fire policy runs against a backend that doesn't
 * serve them.
 *
 * Pessimistic SaaS-mode check (starts false): this gate controls whether
 * PolicyAutoRunController mounts, and that fires GET /api/v1/policies on
 * mount. useSaaSMode()'s optimistic-true default would leak that request
 * against the local/self-hosted backend on cold start before the mode
 * resolves.
 */
export function usePoliciesEnabled(): boolean {
  return POLICIES_ENABLED && useConfirmedSaaSMode();
}
