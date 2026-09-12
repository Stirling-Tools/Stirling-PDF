import { apiClient } from "@portal/api/http";

/**
 * Free-editor fleet usage for the {@link FreePdfEditorsCard}.
 *
 * Self-hosted (this module) reads the local Stirling backend — the figures come
 * from this instance's audit trail, filtered to free UI tool runs. The SaaS build
 * shadows this module (src/portal-saas/api/fleetStats.ts) to read the team-scoped
 * SaaS backend instead.
 *
 * Activity counts cover document operations in the last 30 days of retained
 * history. Disabled recording returns null; the card renders it as "N/A".
 */
export interface FleetStats {
  editorsDeployed: number | null;
  activeThisMonth: number | null;
  pdfsProcessed: number | null;
}

/** Prefer useFleetStats; direct callers must pass the resolved access gate before any request. */
export async function fetchFleetStats(
  enabled: boolean,
  signal?: AbortSignal,
): Promise<FleetStats | null> {
  if (!enabled) return null;
  return apiClient.local.json<FleetStats>("/api/v1/usage/fleet-stats", {
    signal,
  });
}
