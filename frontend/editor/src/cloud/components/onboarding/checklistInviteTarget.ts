import { useState } from "react";
import { useAuth } from "@app/auth/UseSession";
import type { NavKey } from "@app/components/shared/config/types";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";

export interface ChecklistInviteTarget {
  /** True until the data behind `target` first settles; the checklist stays hidden
   * meanwhile, since the row's absence would otherwise read as a finished checklist. */
  loading: boolean;
  /** The settings section where this user can invite people, or null if they can't
   * or already have. */
  target: NavKey | null;
}

/** Guests never can invite: they lead the personal team created for them, but have
 * no account. A team with other members has already learned to invite. */
export function useChecklistInviteTarget(): ChecklistInviteTarget {
  const { isAnonymous } = useAuth();
  const { isTeamLeader, currentTeam, loading } = useSaaSTeam();
  // Latched: the team refetches after membership changes, and that must not hide the card.
  const [settled, setSettled] = useState(!loading);
  if (!loading && !settled) setSettled(true);

  const hasOtherMembers = (currentTeam?.memberCount ?? 0) > 1;
  return {
    loading: !settled,
    target: isTeamLeader && !isAnonymous && !hasOtherMembers ? "users" : null,
  };
}
