import type { NavKey } from "@app/components/shared/config/types";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";
import { useChecklistInviteTarget as useCloudInviteTarget } from "@cloud/components/onboarding/checklistInviteTarget";

/** Cloud team leaders invite from Users; self-hosted admins from People, once login is on.
 * Guests are excluded by the Cloud check and are never self-hosted admins. */
export function useChecklistInviteTarget(): NavKey | null {
  const cloudTarget = useCloudInviteTarget();
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();
  const { config } = useAppConfig();
  if (
    isSelfHosted &&
    isAuthenticated &&
    config?.enableLogin &&
    config.isAdmin
  ) {
    return "people";
  }
  return cloudTarget;
}
