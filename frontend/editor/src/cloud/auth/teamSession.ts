/**
 * Team-session auth seam (@app/auth/teamSession).
 *
 * The cloud/ layer is the SHARED hosted experience consumed by BOTH the saas
 * (web) and desktop (Tauri) leaves, so it must stay platform-portable: it can't
 * reach the Supabase web client ({@code @app/auth/supabase}) or the full
 * SaaS-only {@code useAuth()} (which exposes credit/session refreshers the
 * desktop/proprietary auth context does not). {@link SaaSTeamContext} needs
 * exactly two things from auth, so it consumes them through this narrow seam
 * instead of importing either platform auth surface directly.
 *
 * This module is the DEFAULT + the shared TypeScript contract. Real builds
 * shadow it: saas/auth/teamSession.ts wires the Supabase web session + the
 * anonymous check + the credit/session refresh; desktop/auth/teamSession.ts
 * wires authService. The cloud default reports "no team access" and a no-op
 * refresh, which is only reached by the cloud-standalone typecheck.
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
