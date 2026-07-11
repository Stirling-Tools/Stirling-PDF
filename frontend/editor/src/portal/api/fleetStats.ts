import { apiClient } from "@portal/api/http";

/**
 * Free-editor fleet usage for the {@link FreePdfEditorsCard}.
 *
 * Self-hosted (this module) reads the local Stirling backend — the figures come
 * from this instance's audit trail, filtered to free UI tool runs. The SaaS build
 * shadows this module (src/portal-saas/api/fleetStats.ts) to read the team-scoped
 * SaaS backend instead.
 *
 * Any field may be null when the backend can't compute it (e.g. EE auditing is
 * disabled); the card renders null as "N/A" rather than a misleading 0.
 */
export interface FleetStats {
  editorsDeployed: number | null;
  activeThisMonth: number | null;
  pdfsProcessed: number | null;
}

export function fetchFleetStats(signal?: AbortSignal): Promise<FleetStats> {
  return apiClient.local.json<FleetStats>("/api/v1/usage/fleet-stats", {
    signal,
  });
}
