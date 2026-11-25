import type { UsersBackend } from "@processor/api/usersBackend";
import { usersBackend as cloud } from "@processor-cloud/usersBackend";
import { usersBackend as server } from "@editor-proprietary/portal/usersBackend";
import { editionFunction } from "@processor/edition";

/** Stirling Cloud lists the signed-in team (SaasTeamController); a self-hosted
 *  server lists its own users through the admin endpoints. */
export const usersBackend: UsersBackend = {
  fetchUsers: editionFunction(cloud.fetchUsers, server.fetchUsers),
  fetchTeams: editionFunction(cloud.fetchTeams, server.fetchTeams),
  fetchAuthConfig: editionFunction(
    cloud.fetchAuthConfig,
    server.fetchAuthConfig,
  ),
  inviteMember: editionFunction(cloud.inviteMember, server.inviteMember),
  renameTeam: editionFunction(cloud.renameTeam, server.renameTeam),
  removeMember: editionFunction(cloud.removeMember, server.removeMember),
  cancelInvitation: editionFunction(
    cloud.cancelInvitation,
    server.cancelInvitation,
  ),
};
