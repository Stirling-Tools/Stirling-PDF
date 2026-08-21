/**
 * saas (web) implementation of the @app/auth/teamSession seam.
 *
 * Wires the cloud {@link SaaSTeamContext} to the SaaS-only auth surface it used
 * to reach directly before the move to cloud/: the Supabase web session
 * ({@code useAuth()}), the anonymous check ({@code isUserAnonymous}), and the
 * credit + session refreshers. Those imports are banned in cloud (Supabase web
 * client + the SaaS-only {@code useAuth} shape), so cloud reaches them through
 * {@link useTeamAuth} instead. Behaviour is preserved verbatim from the
 * pre-move saas SaaSTeamContext.
 */
import { useCallback } from "react";
import { useAuth } from "@app/auth/UseSession";
import { isUserAnonymous } from "@app/auth/supabase";
import type { TeamAuth } from "@cloud/auth/teamSession";

export type { TeamAuth } from "@cloud/auth/teamSession";

export function useTeamAuth(): TeamAuth {
  const { user, refreshSession } = useAuth();

  // Teams require a signed-in, non-anonymous user — anonymous (guest) sessions
  // never load or manage teams.
  const canUseTeams = !!user && !isUserAnonymous(user);

  // After a membership change the user's billing tier may have changed, so
  // refresh the Supabase session (mirrors the pre-move accept/leave flow in
  // saas SaaSTeamContext).
  const refreshAfterMembershipChange = useCallback(async () => {
    await refreshSession();
  }, [refreshSession]);

  return { canUseTeams, refreshAfterMembershipChange };
}
