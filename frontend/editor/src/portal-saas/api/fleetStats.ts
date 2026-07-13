import { apiClient } from "@portal/api/http";
import type { FleetStats } from "@portal-proprietary/api/fleetStats";

export type { FleetStats };

/**
 * SaaS build: fleet usage is team-scoped and served by the SaaS backend, so it is
 * read via {@code apiClient.saas} — the admin's Supabase JWT, which the SaaS backend
 * uses to resolve the caller's team. Shadows the self-hosted
 * src/portal/api/fleetStats.ts (which reads the local backend server-wide).
 */
export function fetchFleetStats(signal?: AbortSignal): Promise<FleetStats> {
  return apiClient.saas.json<FleetStats>("/api/v1/usage/fleet-stats", {
    signal,
  });
}
