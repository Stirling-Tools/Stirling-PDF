import type { UsersBackend } from "@portal/api/usersBackend";
import {
  fetchAuthConfig,
  fetchUsers,
  inviteMember,
  removeMember,
} from "@portal/api/users";
import { fetchTeams, renameTeam } from "@portal/api/teams";

/**
 * Self-hosted (proprietary) build: the existing admin-endpoint calls, unchanged.
 * This is exactly the behaviour the Users page had before the seam existed - it
 * just re-exports the `@portal/api/{users,teams}` functions behind the contract.
 */
export const usersBackend: UsersBackend = {
  fetchUsers,
  fetchTeams,
  fetchAuthConfig,
  inviteMember,
  renameTeam,
  removeMember,
  // Self-hosted has no pending-invite concept; the control is gated off
  // (manageInvitations=false) so this is never reached.
  cancelInvitation() {
    return Promise.reject(
      new Error("Cancelling invitations is not supported on self-hosted"),
    );
  },
};
