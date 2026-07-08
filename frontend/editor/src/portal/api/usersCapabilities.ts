/**
 * Which user/team admin actions the current build's backend supports.
 *
 * The Users page UI and its data endpoints are shared across flavors; only this
 * capability set differs. The endpoints are identical - the build flavor just
 * selects the client + credential (`apiClient.local` in @portal/api/http, via the
 * localBackend seam: self-hosted -> local Spring bearer, SaaS -> SaaS-backend
 * Supabase bearer). Resolved at build time via the `@app/*` alias - see
 * `src/proprietary/portal/usersCapabilities.ts`
 * (self-hosted, org-admin: everything) and `src/saas/portal/usersCapabilities.ts`
 * (SaaS, team-leader scoped: invite / rename / remove / seats only).
 */
export interface UsersCapabilities {
  /** Show the "Organization" owners group (a single-org deployment). */
  orgGroup: boolean;
  /** Let an admin reassign roles at all (the role Select). */
  changeRole: boolean;
  /**
   * Whether the "Org Owner" (ROLE_ADMIN) role can be held/assigned. Always false
   * on SaaS - no SaaS user is ever ROLE_ADMIN, so it's dropped from the picker.
   */
  adminRole: boolean;
  /** Create a team from the roster ("+ New team"). */
  createTeam: boolean;
  /** Delete a team. */
  deleteTeam: boolean;
  /** Rename a team. */
  renameTeam: boolean;
  /** Invite by email. */
  emailInvite: boolean;
  /** Create an account directly with a password (self-hosted password login). */
  directCreate: boolean;
  /** Admin password reset. */
  resetPassword: boolean;
  /** Unlock a locked account. */
  unlock: boolean;
  /** Reset (disable) a member's MFA. */
  resetMfa: boolean;
  /** Suspend / reinstate an account. */
  suspend: boolean;
  /** Move a member between teams. */
  moveTeam: boolean;
  /** Per-team seat usage / limits (SaaS billing). */
  seats: boolean;
  /**
   * Manage Processor (portal) access grants. The grant endpoints are ADMIN-only,
   * so this is off on SaaS (team leaders aren't admins) - the +Processor / grant
   * controls are hidden there rather than shown as permanently-403 dead controls.
   */
  manageGrants: boolean;
  /** Whether "remove" takes the member out of the whole org or just the team. */
  removeScope: "org" | "team";
}
