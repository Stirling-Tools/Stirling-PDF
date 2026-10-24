import { useFleetStatsAccess as useCloudFleetStatsAccess } from "@processor-cloud/hooks/useFleetStatsAccess";
import { useFleetStatsAccess as useServerFleetStatsAccess } from "@processor-proprietary/hooks/useFleetStatsAccess";
import { editionHook } from "@processor/edition";

/** Cloud: any signed-in team member. Server: a confirmed admin. */
export const useFleetStatsAccess = editionHook(
  useCloudFleetStatsAccess,
  useServerFleetStatsAccess,
);
