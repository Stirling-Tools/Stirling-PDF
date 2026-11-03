import { useEnterpriseEnabled as useCloudEnterpriseEnabled } from "@processor-cloud/hooks/useEnterpriseEnabled";
import { useEnterpriseEnabled as useServerEnterpriseEnabled } from "@processor-proprietary/hooks/useEnterpriseEnabled";
import { editionHook } from "@processor/edition";

export type { EnterpriseState } from "@processor-proprietary/hooks/useEnterpriseEnabled";

/** Cloud: from the plan tier. Server: from the server's licence. */
export const useEnterpriseEnabled = editionHook(
  useCloudEnterpriseEnabled,
  useServerEnterpriseEnabled,
);
