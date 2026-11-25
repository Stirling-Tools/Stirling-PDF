import { useAccountLinkOwner as useCloudAccountLinkOwner } from "@processor-cloud/hooks/useAccountLinkOwner";
import { useAccountLinkOwner as useServerAccountLinkOwner } from "@processor-proprietary/hooks/useAccountLinkOwner";
import { editionHook } from "@processor/edition";

/** Only a self-hosted server has an instance link to own. */
export const useAccountLinkOwner = editionHook(
  useCloudAccountLinkOwner,
  useServerAccountLinkOwner,
);
