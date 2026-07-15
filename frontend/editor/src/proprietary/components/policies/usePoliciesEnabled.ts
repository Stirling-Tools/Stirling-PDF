import { POLICIES_ENABLED } from "@app/constants/featureFlags";

/**
 * Whether policy enforcement is active for this build. Gates mounting the
 * headless PolicyAutoRunController. Shadows the core stub; the desktop build
 * shadows this again to additionally require an active SaaS connection.
 */
export function usePoliciesEnabled(): boolean {
  return POLICIES_ENABLED;
}
