import {
  loadPolicies as loadServerPolicies,
  rawStoredPolicies as rawServerPolicies,
} from "@proprietary/services/policyStorage";
export {
  clearPolicies,
  updatePolicy,
  forgetPolicies,
  onPoliciesChange,
  POLICIES_CHANGE_EVENT,
} from "@proprietary/services/policyStorage";
import { connectionModeService } from "@app/services/connectionModeService";
import { authService } from "@app/services/authService";
import type { PoliciesByKey } from "@app/types/policies";

function canReadPolicies(): boolean {
  const mode = connectionModeService.getCachedMode();
  const status = authService.getAuthStatus();
  return (
    mode !== null &&
    mode !== "local" &&
    (status === "authenticated" || status === "refreshing")
  );
}

/** Local-only sessions have no policy enforcement, including cached export policies. */
export function loadPolicies(): PoliciesByKey {
  return canReadPolicies() ? loadServerPolicies() : {};
}

export function rawStoredPolicies(): string | null {
  return canReadPolicies() ? rawServerPolicies() : null;
}
