import type { UsersCapabilities } from "@portal/api/usersCapabilities";

/**
 * SaaS build: team-leader scope. No org-wide roster, no create-team, and no
 * password/role administration (Supabase-authed users); leaders invite, rename,
 * remove members, and manage seats. Mirrors what SaasTeamController exposes.
 */
export const usersCapabilities: UsersCapabilities = {
  orgGroup: false,
  changeRole: false,
  adminRole: false,
  createTeam: false,
  deleteTeam: false,
  renameTeam: true,
  emailInvite: true,
  directCreate: false,
  resetPassword: false,
  unlock: false,
  resetMfa: false,
  suspend: false,
  moveTeam: false,
  seats: true,
  manageGrants: false,
  removeScope: "team",
};
