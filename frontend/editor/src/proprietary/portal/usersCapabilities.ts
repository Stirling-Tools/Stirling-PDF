import type { UsersCapabilities } from "@portal/api/usersCapabilities";

/**
 * Self-hosted (proprietary) build: org-admin scope - the full set. Matches the
 * behaviour the Users page had before the flavor seam existed.
 */
export const usersCapabilities: UsersCapabilities = {
  orgGroup: true,
  changeRole: true,
  adminRole: true,
  createTeam: true,
  deleteTeam: true,
  renameTeam: true,
  emailInvite: true,
  manageInvitations: false,
  directCreate: true,
  resetPassword: true,
  unlock: true,
  resetMfa: true,
  suspend: true,
  moveTeam: true,
  seats: false,
  manageGrants: true,
  removeScope: "org",
};
