import { usersCapabilities as cloudCapabilities } from "@processor-cloud/usersCapabilities";
import { usersCapabilities as serverCapabilities } from "@editor-proprietary/portal/usersCapabilities";
import { editionObject } from "@processor/edition";

/** Team-leader scope on Stirling Cloud, org-admin scope on a self-hosted server. */
export const usersCapabilities = editionObject(
  cloudCapabilities,
  serverCapabilities,
);
