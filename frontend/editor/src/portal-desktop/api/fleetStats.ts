import { fetchFleetStats as fetchCloudFleetStats } from "@portal-cloud/api/fleetStats";
import { fetchFleetStats as fetchServerFleetStats } from "@portal-proprietary/api/fleetStats";
import { editionFunction } from "@portal/edition";

export type { FleetStats } from "@portal-proprietary/api/fleetStats";

/** Cloud: the team's usage from Stirling Cloud. Server: the whole server's. */
export const fetchFleetStats = editionFunction(
  fetchCloudFleetStats,
  fetchServerFleetStats,
);
