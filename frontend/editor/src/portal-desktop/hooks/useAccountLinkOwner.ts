import { useAccountLinkOwner as useCloudAccountLinkOwner } from "@portal-cloud/hooks/useAccountLinkOwner";
import { useAccountLinkOwner as useServerAccountLinkOwner } from "@portal-proprietary/hooks/useAccountLinkOwner";
import { editionHook } from "@portal/edition";

/** Only a self-hosted server has an instance link to own. */
export const useAccountLinkOwner = editionHook(
  useCloudAccountLinkOwner,
  useServerAccountLinkOwner,
);
