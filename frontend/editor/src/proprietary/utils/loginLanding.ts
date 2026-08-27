import { isAdminRole } from "@app/auth/roles";
import { fetchAppConfig } from "@app/api/config";
import apiClient from "@app/services/apiClient";
import { preferencesService } from "@app/services/preferencesService";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

/**
 * Role-based landing, shared by every flavor (self-hosted + SaaS).
 *
 * Backs the router at "/" (RootGate) and the destination a fresh login lands on:
 * users who can use the processor (portal) are sent there, everyone else to the
 * editor. The decision is driven by the shared `/api/v1/auth/me` endpoint so
 * there is a single code path for all flavors:
 *
 * - Self-hosted: `portalAccess` from `/me` (admin, ACL grant, or team owner) is
 *   the clean signal - there are no personal teams, and `/api/v1/team/my` does
 *   not exist (404).
 * - SaaS: every user leads their own personal team, so `portalAccess`/`teamLead`
 *   are true for everyone and useless. SaaS additionally exposes
 *   `/api/v1/team/my`, so there we require admin, or leadership of a NON-personal
 *   team, which excludes members and solo/personal users.
 */

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

interface MeUser {
  role?: string;
  portalAccess?: boolean;
}

/**
 * Where a visitor to "/" belongs.
 *
 * `signedOut` is deliberately distinct from `editor`: there is no role to route
 * on, so "/" hands off to the app itself rather than redirecting. Only the app
 * knows the whole picture (login enabled? backend up? SaaS inline sign-in?), and
 * guessing from here risks bouncing a user between "/" and "/login".
 */
export type RootDestination = "processor" | "editor" | "signedOut";

/**
 * The gates that need no backend lookup: soft-release flag off, no processor in
 * this build, or the user pinned the editor in Settings. Returns the editor when
 * one applies, else null (a lookup is needed).
 */
function shortCircuitToEditor(): string | null {
  const pinnedEditor =
    preferencesService.getPreference("loginLandingView") === "editor";
  return loginLandingMode() !== "dynamic" ||
    !isPortalAvailable() ||
    pinnedEditor
    ? EDITOR_BASENAME
    : null;
}

/**
 * Where a visitor to "/" should be sent, or null when there is no role to route
 * on (signed out) and "/" should just render the app. See RootGate.
 */
export async function resolveRootTarget(): Promise<string | null> {
  const shortCircuit = shortCircuitToEditor();
  if (shortCircuit) return shortCircuit;
  const destination = await fetchRootDestination();
  if (destination === "signedOut") return null;
  if (destination === "editor") return EDITOR_BASENAME;
  // Checked last so a signed-out visitor still reports signedOut: an editor-only
  // server doesn't mount the processor route, so landing there would bounce.
  // Only an explicit false counts - an unreachable config must not quietly take
  // the portal away from an admin, and PortalRoute re-checks on arrival anyway.
  const config = await fetchAppConfig().catch(() => null);
  return config?.processorEnabled === false ? EDITOR_BASENAME : PORTAL_BASENAME;
}

/**
 * Where a session that has just been established should land - the path a fresh
 * login navigates to when it has no explicit destination of its own.
 *
 * Login resolves this itself rather than handing off to "/" so the app it just
 * mounted is never torn down and remounted on the way through. "/" (RootGate)
 * applies the same rules for people who simply arrive there.
 */
export async function resolveLandingPath(): Promise<string> {
  return (await resolveRootTarget()) ?? EDITOR_BASENAME;
}

/**
 * Where the current visitor should land from "/". One decision for all flavors:
 * fetch the shared `/api/v1/auth/me`, then branch on whether `/api/v1/team/my`
 * exists (SaaS) or 404s (self-hosted). An ambiguous lookup defaults to the
 * editor (safe); an unauthenticated one reports `signedOut`.
 */
export async function fetchRootDestination(): Promise<RootDestination> {
  let user: MeUser | undefined;
  try {
    const me = await apiClient.get<{ user?: MeUser }>("/api/v1/auth/me", {
      suppressErrorToast: true,
    });
    user = me.data?.user;
  } catch {
    return "signedOut"; // not authenticated / unreachable → let the app decide
  }
  if (!user) return "signedOut";

  try {
    const teams = await apiClient.get<LandingTeam[]>("/api/v1/team/my", {
      suppressErrorToast: true,
    });
    // SaaS: precise per-team data lets us exclude personal-team-only "leaders".
    return isAdminRole(user.role) || leadsRealTeam(teams.data ?? [])
      ? "processor"
      : "editor";
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      // Self-hosted: no /team/my. portalAccess (admin / grant / team owner) is
      // the clean signal there.
      return user.portalAccess === true ? "processor" : "editor";
    }
    return "editor"; // ambiguous lookup failure → stay on the editor
  }
}
