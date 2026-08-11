import { useQuery } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import { fetchFleetStats, type FleetStats } from "@processor/api/fleetStats";
import {
  fetchAuditLog,
  type AuditLogResponse,
} from "@processor/api/infrastructure";
import {
  fetchEditorDeployment,
  type EditorDeploymentResponse,
} from "@processor/api/editorDeploy";
import type { Tier } from "@processor/contexts/TierContext";

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
