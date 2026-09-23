import type { NavKey } from "@app/components/shared/config/types";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";

/** The settings section where this user can invite people, or null if they can't. */
export function useChecklistInviteTarget(): NavKey | null {
  const { isTeamLeader } = useSaaSTeam();
  return isTeamLeader ? "users" : null;
}
