/**
 * Desktop (Tauri) implementation of the @app/auth/teamSession seam.
 *
 * Wires the cloud {@link SaaSTeamContext} to the desktop auth surface. Desktop
 * keeps its JWT in the Tauri secure store via authService, so team access is
 * gated on a live "authenticated" status from authService rather than a
 * Supabase session.
 *
 * Teams are a cloud-only surface: the endpoints (/api/v1/team/**) live on the
 * SaaS backend, not the local bundled backend or a self-hosted server. The
 * SaaSTeamProvider is mounted unconditionally in AppProviders, so canUseTeams
 * is the ONLY thing stopping its mount effect from fetching teams. It must
 * therefore also require SaaS connection mode — otherwise an authenticated user
 * in self-hosted or local ("disconnected") mode triggers /api/v1/team/my +
 * /api/v1/team/invitations/pending against a backend that 404s them.
 *
 * The SaaS-mode flag starts pessimistically false (NOT useSaaSMode()'s
 * optimistic true): authService and connectionModeService resolve
 * independently, and an optimistic default would let one team fetch slip
 * through on cold start before the mode is known. Desktop has no credit/session
 * refreshers, so the post-membership refresh is a no-op.
 */
import { useEffect, useState } from "react";
import { authService } from "@app/services/authService";
import { useConfirmedSaaSMode } from "@app/hooks/useConfirmedSaaSMode";
import type { TeamAuth } from "@cloud/auth/teamSession";

export type { TeamAuth } from "@cloud/auth/teamSession";

export function useTeamAuth(): TeamAuth {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Pessimistic SaaS-mode check (starts false) so no team fetch slips through on
  // cold start before the mode resolves. Shared with the Policies gate.
  const isSaaSMode = useConfirmedSaaSMode();

  useEffect(() => {
    // subscribeToAuth immediately notifies the listener of the current state,
    // so no separate initial fetch is needed.
    return authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === "authenticated");
    });
  }, []);

  return {
    canUseTeams: isAuthenticated && isSaaSMode,
    refreshAfterMembershipChange: async () => {},
  };
}
