import { useAuth } from "@app/auth/UseSession";
import type { NavKey } from "@app/components/shared/config/types";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";

/** The settings section where this user can invite people, or null if they can't
 * or already have. Guests never can: they lead the personal team created for them,
 * but have no account. A team with other members has already learned to invite. */
export function useChecklistInviteTarget(): NavKey | null {
  const { isAnonymous } = useAuth();
  const { isTeamLeader, currentTeam } = useSaaSTeam();
  const hasOtherMembers = (currentTeam?.memberCount ?? 0) > 1;
  return isTeamLeader && !isAnonymous && !hasOtherMembers ? "users" : null;
}
