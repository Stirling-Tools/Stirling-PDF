import type { UsersBackend } from "@portal/api/usersBackend";
import {
  fetchAuthConfig,
  fetchUsers as fetchAdminUsers,
  inviteMember,
  removeMember,
  type PendingInvitation,
  type UsersResponse,
} from "@portal/api/users";
import { listInviteLinks, revokeInviteLink } from "@portal/api/inviteLinks";
import { fetchTeams, renameTeam } from "@portal/api/teams";
import type { Tier } from "@portal/contexts/TierContext";

/**
 * Self-hosted (proprietary) build: the admin-endpoint calls, plus the invite
 * links issued but not yet redeemed. A link is this flavor's pending invitation
 * - the account only exists once someone redeems it - so it lands in the same
 * `invitations` list the SaaS build fills from TeamInvitations.
 */
async function fetchUsers(tier: Tier): Promise<UsersResponse> {
  const roster = await fetchAdminUsers(tier);
  // Best-effort: the roster is the page, and a mail-disabled or non-admin
  // instance must still render it rather than fail on the link listing.
  const invitations = await listInviteLinks()
    .then((links): PendingInvitation[] =>
      links.map((link) => ({
        id: link.id,
        email: link.email ?? "",
        invitedBy: link.createdBy,
        expiresAt: link.expiresAt,
      })),
    )
    .catch(() => []);
  return { ...roster, invitations };
}

export const usersBackend: UsersBackend = {
  fetchUsers,
  fetchTeams,
  fetchAuthConfig,
  inviteMember,
  renameTeam,
  removeMember,
  cancelInvitation: revokeInviteLink,
};
