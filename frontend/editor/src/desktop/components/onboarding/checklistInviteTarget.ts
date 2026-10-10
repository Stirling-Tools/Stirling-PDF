import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSelfHostedAuth } from "@app/hooks/useSelfHostedAuth";
import { useServerExperience } from "@app/hooks/useServerExperience";
import {
  useChecklistInviteTarget as useCloudInviteTarget,
  type ChecklistInviteTarget,
} from "@cloud/components/onboarding/checklistInviteTarget";

export type { ChecklistInviteTarget } from "@cloud/components/onboarding/checklistInviteTarget";

/** Cloud team leaders invite from Users; self-hosted admins from People, once login
 * is on and they are still the server's only user. Guests are excluded by the Cloud
 * check and are never self-hosted admins. */
export function useChecklistInviteTarget(): ChecklistInviteTarget {
  const cloudTarget = useCloudInviteTarget();
  const { isSelfHosted, isAuthenticated } = useSelfHostedAuth();
  const { config } = useAppConfig();
  const { totalUsers, userCountSource, userCountError } = useServerExperience();
  if (isSelfHosted) {
    const isAdmin = Boolean(
      isAuthenticated && config?.enableLogin && config.isAdmin,
    );
    // A successful fetch sets the source, a failed one the error; a refresh keeps both.
    const countPending = userCountSource === "unknown" && !userCountError;
    // Only the admin count is exact; the WAU fallback estimates browsers, not accounts.
    const hasOtherUsers = userCountSource === "admin" && (totalUsers ?? 0) > 1;
    return {
      loading: isAdmin && countPending,
      target: isAdmin && !hasOtherUsers ? "people" : null,
    };
  }
  return cloudTarget;
}
