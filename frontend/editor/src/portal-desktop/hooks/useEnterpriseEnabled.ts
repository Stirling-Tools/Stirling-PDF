import { useEnterpriseEnabled as useCloudEnterpriseEnabled } from "@portal-cloud/hooks/useEnterpriseEnabled";
import { useEnterpriseEnabled as useServerEnterpriseEnabled } from "@portal-proprietary/hooks/useEnterpriseEnabled";
import { editionHook } from "@portal/edition";

export type { EnterpriseState } from "@portal-proprietary/hooks/useEnterpriseEnabled";

/** Cloud: from the plan tier. Server: from the server's licence. */
export const useEnterpriseEnabled = editionHook(
  useCloudEnterpriseEnabled,
  useServerEnterpriseEnabled,
);
