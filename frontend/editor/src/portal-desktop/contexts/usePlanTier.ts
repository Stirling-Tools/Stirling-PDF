import { usePlanTier as useCloudPlanTier } from "@portal-cloud/contexts/usePlanTier";
import { usePlanTier as useServerPlanTier } from "@portal-proprietary/contexts/usePlanTier";
import { editionHook } from "@portal/edition";

/** Cloud: from the signed-in account's wallet. Server: from the instance link. */
export const usePlanTier = editionHook(useCloudPlanTier, useServerPlanTier);
