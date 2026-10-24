import { fetchFleetStats as fetchCloudFleetStats } from "@processor-cloud/api/fleetStats";
import { fetchFleetStats as fetchServerFleetStats } from "@processor-proprietary/api/fleetStats";
import { editionFunction } from "@processor/edition";

export type { FleetStats } from "@processor-proprietary/api/fleetStats";

/** Cloud: the team's usage from Stirling Cloud. Server: the whole server's. */
export const fetchFleetStats = editionFunction(
  fetchCloudFleetStats,
  fetchServerFleetStats,
);
