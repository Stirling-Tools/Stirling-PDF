import { usersBackend as cloudUsersBackend } from "@processor-cloud/usersBackend";
import { usersBackend as serverUsersBackend } from "@editor-proprietary/portal/usersBackend";
import { editionObject } from "@processor/edition";

/** Stirling Cloud lists the signed-in team (SaasTeamController); a self-hosted
 *  server lists its own users through the admin endpoints. */
export const usersBackend = editionObject(
  cloudUsersBackend,
  serverUsersBackend,
);
