import { usePlanTier as useCloudPlanTier } from "@processor-cloud/contexts/usePlanTier";
import { usePlanTier as useServerPlanTier } from "@processor-proprietary/contexts/usePlanTier";
import { editionHook } from "@processor/edition";

/** Cloud: from the signed-in account's wallet. Server: from the instance link. */
export const usePlanTier = editionHook(useCloudPlanTier, useServerPlanTier);
