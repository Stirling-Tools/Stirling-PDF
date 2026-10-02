import { useFleetStatsAccess as useCloudFleetStatsAccess } from "@portal-cloud/hooks/useFleetStatsAccess";
import { useFleetStatsAccess as useServerFleetStatsAccess } from "@portal-proprietary/hooks/useFleetStatsAccess";
import { editionHook } from "@portal/edition";

/** Cloud: any signed-in team member. Server: a confirmed admin. */
export const useFleetStatsAccess = editionHook(
  useCloudFleetStatsAccess,
  useServerFleetStatsAccess,
);
