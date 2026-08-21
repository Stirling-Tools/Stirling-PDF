/**
 * Team-session auth seam (@app/auth/teamSession). {@link SaaSTeamContext} needs
 * just two things from auth (can-use-teams + a post-membership refresh), so it
 * consumes them through this narrow seam rather than reaching a platform auth
 * surface directly. Default reports no access; saas/ and desktop/ shadow it.
 */

/**
 * The minimal auth surface {@link SaaSTeamContext} depends on.
 *
 * Each platform supplies its own implementation:
 *  - {@link canUseTeams} is {@code true} only for a signed-in, non-anonymous
 *    user (web: Supabase non-anonymous session; desktop: a valid authService
 *    token). When {@code false} the context stays empty and makes no API calls.
 *  - {@link refreshAfterMembershipChange} is invoked after a membership change
 *    (accepting an invite, leaving a team) so the platform can refresh any
 *    derived auth-tier state. On web this refreshes credits + the Supabase
 *    session; on desktop it is a no-op (no such derived state).
 */
export interface TeamAuth {
  /** Whether the current session may load/manage teams (signed in, not anonymous). */
  canUseTeams: boolean;
  /** Refresh derived auth state after a team membership change. */
  refreshAfterMembershipChange: () => Promise<void>;
}

/**
 * Resolve the team-relevant auth surface for the current session. Cloud default
 * reports no access + a no-op refresh; saas/desktop shadow it. Implemented as a
 * hook so the saas/desktop impls can subscribe to live auth state.
 */
export function useTeamAuth(): TeamAuth {
  return {
    canUseTeams: false,
    refreshAfterMembershipChange: async () => {},
  };
}
