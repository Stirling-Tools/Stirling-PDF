import { isAdminRole } from "@app/auth/roles";
import type { Team } from "@app/contexts/SaaSTeamContext";

/**
 * Role-based login landing (SaaS).
 *
 * On a fresh sign-in, team leads are sent to the processor (portal) and members
 * to the editor. Only leaders of a real (non-personal) team count: solo users
 * lead only their personal team and belong on the editor, same as members - who
 * can't reach the processor at all.
 */

// sessionStorage flag set at a genuine fresh login and consumed once when the
// user lands, so the redirect never hijacks later in-session navigation (e.g.
// switching back to the editor from the processor).
export const LOGIN_LANDING_PENDING_KEY = "stirling_saas_login_landing_pending";

export type LoginLandingMode = "editor" | "dynamic";

/**
 * Build flag (VITE_LOGIN_LANDING_MODE) gating the whole role-based landing:
 * - "dynamic" (default): team leads land on the processor, members on the
 *   editor, with a per-user override in Settings.
 * - "editor": every user lands on the editor after login - the soft-release
 *   escape hatch. The processor is still reachable via the app switcher, but no
 *   one is auto-routed to it and the per-user setting stays hidden.
 */
export function loginLandingMode(): LoginLandingMode {
  return import.meta.env.VITE_LOGIN_LANDING_MODE === "editor"
    ? "editor"
    : "dynamic";
}

/** A user "leads a team" (→ processor) only if they lead a non-personal team. */
export function leadsRealTeam(teams: Team[]): boolean {
  return teams.some((team) => team.isLeader && !team.isPersonal);
}

/**
 * Who defaults to (and may choose) the processor: an admin, or a leader of a
 * non-personal team. Admins are included via role because in SaaS every user
 * leads their own personal team, so the backend teamLead/portalAccess flags are
 * true for everyone - the backend role (from /api/v1/auth/me) is the only
 * reliable admin signal, and non-personal leadership comes from /api/v1/team/my.
 */
export function landsOnProcessor(
  role: string | null | undefined,
  teams: Team[],
): boolean {
  return isAdminRole(role) || leadsRealTeam(teams);
}

// The processor/portal route-set is only bundled in some builds (mirrors
// adminRouteExtensions); redirecting to it otherwise would 404 to the editor.
export function isPortalAvailable(): boolean {
  return import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;
}

/** Flag a genuine fresh login so the landing redirect fires exactly once. */
export function markLoginLandingPending(): void {
  try {
    window.sessionStorage.setItem(LOGIN_LANDING_PENDING_KEY, "1");
  } catch {
    // sessionStorage unavailable (private mode / SSR): skip the one-time redirect.
  }
}

/** Whether a fresh-login redirect is still pending (non-destructive peek). */
export function hasLoginLandingPending(): boolean {
  try {
    return window.sessionStorage.getItem(LOGIN_LANDING_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

/** Clear the pending flag; returns whether it was set. */
export function consumeLoginLandingPending(): boolean {
  try {
    const pending =
      window.sessionStorage.getItem(LOGIN_LANDING_PENDING_KEY) === "1";
    if (pending) window.sessionStorage.removeItem(LOGIN_LANDING_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}
