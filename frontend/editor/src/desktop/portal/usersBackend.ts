import { usersBackend as cloudUsersBackend } from "@portal-cloud/usersBackend";
import { usersBackend as serverUsersBackend } from "@proprietary/portal/usersBackend";
import { editionObject } from "@portal/edition";

/** Stirling Cloud lists the signed-in team (SaasTeamController); a self-hosted
 *  server lists its own users through the admin endpoints. */
export const usersBackend = editionObject(
  cloudUsersBackend,
  serverUsersBackend,
);
