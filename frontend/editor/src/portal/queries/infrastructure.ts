import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import { fetchFleetStats, type FleetStats } from "@portal/api/fleetStats";
import {
  fetchAuditLog,
  type AuditLogResponse,
} from "@portal/api/infrastructure";
import {
  fetchEditorDeployment,
  type EditorDeploymentResponse,
} from "@portal/api/editorDeploy";
import type { Tier } from "@portal/contexts/TierContext";

/** Base query: fleet processing stats (GET /api/v1/usage/fleet-stats). */
export function useFleetStats(): AsyncState<FleetStats> {
  return toAsyncState(
    useQuery({
      queryKey: qk.fleetStats(),
      queryFn: ({ signal }) => fetchFleetStats(signal),
    }),
  );
}

/** Base query: recent audit-log activity (tier-scoped). */
export function useAuditLog(tier: Tier): AsyncState<AuditLogResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.auditLog(tier),
      queryFn: () => fetchAuditLog(tier),
    }),
  );
}

/** Base query: editor deployment health (tier-scoped). Shared by Home's hero /
 *  status card, EditorAdmin, and onboarding. Best-effort — callers tolerate a
 *  404 on a bare backend, so no retry. */
export function useEditorDeployment(
  tier: Tier,
): AsyncState<EditorDeploymentResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.editorDeployment(tier),
      queryFn: () => fetchEditorDeployment(tier),
      retry: false,
    }),
  );
}
