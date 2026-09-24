import { useAuth } from "@app/auth/UseSession";
import type { NavKey } from "@app/components/shared/config/types";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";

/** The settings section where this user can invite people, or null if they can't.
 * Guests never can: they lead the personal team created for them, but have no account. */
export function useChecklistInviteTarget(): NavKey | null {
  const { isAnonymous } = useAuth();
  const { isTeamLeader } = useSaaSTeam();
  return isTeamLeader && !isAnonymous ? "users" : null;
}
