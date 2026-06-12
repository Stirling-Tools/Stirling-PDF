/**
 * Desktop (Tauri) implementation of the @app/auth/teamSession seam.
 *
 * Wires the cloud {@link SaaSTeamContext} to the desktop auth surface. Desktop
 * keeps its JWT in the Tauri secure store via authService, so team access is
 * gated on a live "authenticated" status from authService rather than a
 * Supabase session.
 *
 * Note: the pre-move desktop SaaSTeamContext additionally gated every call on
 * {@code connectionModeService.getCurrentMode() === "saas"}. We are SaaS-only
 * for now, so that gate is dropped here — the desktop team nav section is
 * already only mounted in SaaS mode (see configNavSections), which is the same
 * place the gate mattered. Desktop has no credit/session refreshers (the
 * pre-move context noted this), so the post-membership refresh is a no-op.
 */
import { useEffect, useState } from "react";
import { authService } from "@app/services/authService";
import type { TeamAuth } from "@cloud/auth/teamSession";

export type { TeamAuth } from "@cloud/auth/teamSession";

export function useTeamAuth(): TeamAuth {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // subscribeToAuth immediately notifies the listener of the current state,
    // so no separate initial fetch is needed.
    return authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === "authenticated");
    });
  }, []);

  return {
    canUseTeams: isAuthenticated,
    refreshAfterMembershipChange: async () => {},
  };
}
