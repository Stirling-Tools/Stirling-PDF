import { isAdminRole } from "@app/auth/roles";
import apiClient from "@app/services/apiClient";

/**
 * Role-based login landing, shared by every flavor (self-hosted + SaaS).
 *
 * On a fresh sign-in, users who can use the processor (portal) land there;
 * everyone else lands on the editor. The decision is driven by the shared
 * `/api/v1/auth/me` endpoint so there is a single code path for all flavors:
 *
 * - Self-hosted: `portalAccess` from `/me` (admin, ACL grant, or team owner) is
 *   the clean signal - there are no personal teams, and `/api/v1/team/my` does
 *   not exist (404).
 * - SaaS: every user leads their own personal team, so `portalAccess`/`teamLead`
 *   are true for everyone and useless. SaaS additionally exposes
 *   `/api/v1/team/my`, so there we require admin, or leadership of a NON-personal
 *   team, which excludes members and solo/personal users.
 */

// sessionStorage flag set at a genuine fresh login and consumed once when the
// user lands, so the redirect never hijacks later in-session navigation (e.g.
// switching back to the editor from the processor).
export const LOGIN_LANDING_PENDING_KEY = "stirling_login_landing_pending";

export type LoginLandingMode = "editor" | "dynamic";

/** Minimal shape of a `/api/v1/team/my` row that the decision needs. */
export interface LandingTeam {
  isLeader: boolean;
  isPersonal: boolean;
}

/** A user "leads a team" (→ processor) only if they lead a non-personal team. */
export function leadsRealTeam(teams: LandingTeam[]): boolean {
  return teams.some((team) => team.isLeader && !team.isPersonal);
}

// The processor/portal route-set is only bundled in some builds (mirrors
// adminRouteExtensions); redirecting to it otherwise would 404 to the editor.
export function isPortalAvailable(): boolean {
  return import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;
}

/**
 * Build flag (VITE_LOGIN_LANDING_MODE) gating the whole role-based landing:
 * - "dynamic" (default): processor users land on the processor, everyone else on
 *   the editor, with a per-user override in Settings.
 * - "editor": everyone lands on the editor - the soft-release escape hatch. The
 *   processor is still reachable via the app switcher, but no one is auto-routed
 *   to it and the per-user setting stays hidden.
 */
export function loginLandingMode(): LoginLandingMode {
  return import.meta.env.VITE_LOGIN_LANDING_MODE === "editor"
    ? "editor"
    : "dynamic";
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

interface MeUser {
  role?: string;
  portalAccess?: boolean;
}

/**
 * Whether the signed-in user should land on the processor. One decision for all
 * flavors: fetch the shared `/api/v1/auth/me`, then branch on whether
 * `/api/v1/team/my` exists (SaaS) or 404s (self-hosted). Any failure defaults to
 * the editor (safe). Best-effort - callers treat a thrown/false result as editor.
 */
export async function fetchLandsOnProcessor(): Promise<boolean> {
  let user: MeUser | undefined;
  try {
    const me = await apiClient.get<{ user?: MeUser }>("/api/v1/auth/me", {
      suppressErrorToast: true,
    });
    user = me.data?.user;
  } catch {
    return false; // not authenticated / unreachable → stay on the editor
  }
  if (!user) return false;

  try {
    const teams = await apiClient.get<LandingTeam[]>("/api/v1/team/my", {
      suppressErrorToast: true,
    });
    // SaaS: precise per-team data lets us exclude personal-team-only "leaders".
    return isAdminRole(user.role) || leadsRealTeam(teams.data ?? []);
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      // Self-hosted: no /team/my. portalAccess (admin / grant / team owner) is
      // the clean signal there.
      return user.portalAccess === true;
    }
    return false; // ambiguous lookup failure → stay on the editor
  }
}
