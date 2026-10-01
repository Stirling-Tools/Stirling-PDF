import type { NavKey } from "@app/components/shared/config/types";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";
import { useServerExperience } from "@app/hooks/useServerExperience";
import { useChecklistInviteTarget as useCloudInviteTarget } from "@cloud/components/onboarding/checklistInviteTarget";

/** Cloud team leaders invite from Users; self-hosted admins from People, once login
 * is on and they are still the server's only user. Guests are excluded by the Cloud
 * check and are never self-hosted admins. */
export function useChecklistInviteTarget(): NavKey | null {
  const cloudTarget = useCloudInviteTarget();
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();
  const { config } = useAppConfig();
  const { totalUsers, userCountSource } = useServerExperience();
  if (isSelfHosted) {
    const isAdmin = isAuthenticated && config?.enableLogin && config.isAdmin;
    // Only the admin count is exact; the WAU fallback estimates browsers, not accounts.
    const hasOtherUsers = userCountSource === "admin" && (totalUsers ?? 0) > 1;
    return isAdmin && !hasOtherUsers ? "people" : null;
  }
  return cloudTarget;
}
