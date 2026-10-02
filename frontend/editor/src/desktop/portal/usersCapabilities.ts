import { usersCapabilities as cloudCapabilities } from "@portal-cloud/usersCapabilities";
import { usersCapabilities as serverCapabilities } from "@proprietary/portal/usersCapabilities";
import { editionObject } from "@portal/edition";

/** Team-leader scope on Stirling Cloud, org-admin scope on a self-hosted server. */
export const usersCapabilities = editionObject(
  cloudCapabilities,
  serverCapabilities,
);
