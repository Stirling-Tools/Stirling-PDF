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
  SchemaDrift,
  StageKey,
  StageSummary,
} from "@portal/mocks/pipelines";

/** GET /api/v1/pipelines?tier=… — the deployed fleet plus tier-specific extras. */
export async function fetchPipelines(tier: Tier): Promise<PipelinesResponse> {
  return httpJson<PipelinesResponse>(
    `/api/v1/pipelines?tier=${encodeURIComponent(tier)}`,
  );
}
