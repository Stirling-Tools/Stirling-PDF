/**
 * Per-flavor backend for the Users page.
 *
 * The Users page UI is shared, but its data + mutation endpoints differ by
 * flavor. Self-hosted (org-admin) talks to the proprietary admin endpoints
 * (`/api/v1/user/admin/*`, `/api/v1/team/*`, `ui-data/admin-settings`), which
 * require ROLE_ADMIN. SaaS users are always ROLE_USER, so those 403 there;
 * instead the SaaS build talks to the invitation-based `SaasTeamController`
 * (`/api/v1/team/{my,invite,{id}/members,{id}/invitations,...}`) as a team
 * leader. Both go through `apiClient.local` (flavor-aware transport).
 *
 * Resolved at build time via the `@app/*` alias, same as `usersCapabilities`:
 * `src/proprietary/portal/usersBackend.ts` (self-hosted) and
 * `src/saas/portal/usersBackend.ts` (SaaS). This module is just the shared
 * contract; only the flavor-divergent operations live here. Self-hosted-only
 * actions (role changes, suspend, password reset, MFA, grants, create/delete
 * team) stay in `@portal/api/{users,teams}` and are gated off on SaaS via
 * `usersCapabilities`.
 */
import type { Tier } from "@portal/contexts/TierContext";
import type { UsersResponse } from "@portal/mocks/users";
import type { Member, RoleId } from "@portal/mocks/users";
import type { Team } from "@portal/api/teams";
import type { AdminAuthConfig, InviteResult } from "@portal/api/users";

export interface UsersBackend {
  /** Roster + summary + (SaaS) pending invitations, adapted onto UsersResponse. */
  fetchUsers(tier: Tier): Promise<UsersResponse>;
  /** Teams shown in the roster / invite team picker. */
  fetchTeams(): Promise<Team[]>;
  /** Login/auth config that shapes the invite modal (direct-create, OAuth/SAML). */
  fetchAuthConfig(): Promise<AdminAuthConfig>;
  /** Invite a member by email (self-hosted: admin invite; SaaS: team invite). */
  inviteMember(
    email: string,
    role: Extract<RoleId, "admin" | "member">,
    teamId?: number,
  ): Promise<InviteResult>;
  /** Rename a team. */
  renameTeam(teamId: number, newName: string): Promise<void>;
  /** Remove a member (self-hosted: delete account; SaaS: remove from team). */
  removeMember(member: Member): Promise<void>;
  /**
   * Cancel a pending invitation by id (SaaS). Never called on self-hosted
   * (gated off by `manageInvitations`); the proprietary impl rejects it.
   */
  cancelInvitation(invitationId: number): Promise<void>;
}
