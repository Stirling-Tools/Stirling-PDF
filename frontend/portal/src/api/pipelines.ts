import { httpJson } from "@portal/api/http";
import type { PipelinesResponse } from "@portal/mocks/pipelines";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  EvalsNote,
  GoldenSet,
  Pipeline,
  PipelineMetrics,
  PipelinesResponse,
  PipelineStatus,
  PromotedPipeline,
  PromotedStatus,
  SchemaDrift,
  StageKey,
  StageSummary,
} from "@portal/mocks/pipelines";

/** GET /v1/pipelines?tier=… — the deployed fleet plus tier-specific extras. */
export async function fetchPipelines(tier: Tier): Promise<PipelinesResponse> {
  return httpJson<PipelinesResponse>(
    `/v1/pipelines?tier=${encodeURIComponent(tier)}`,
  );
}

/**
 * Promote a watch-folder-derived pipeline into a governed org policy, so its
 * rules apply fleet-wide instead of just to the originating flow.
 *
 * TODO(backend): POST /v1/pipelines/{id}/promote-to-policy — should create the
 * policy from the pipeline's stages and return the new policy id. The mock
 * handler resolves `{ ok: true }`; the UI treats a resolved promise as accepted.
 */
export async function promoteToPolicy(id: string): Promise<{ ok: true }> {
  return httpJson<{ ok: true }>(
    `/v1/pipelines/${encodeURIComponent(id)}/promote-to-policy`,
    { method: "POST" },
  );
}
