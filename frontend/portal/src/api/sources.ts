import { httpJson } from "@portal/api/http";
import type { SourcesResponse } from "@portal/mocks/sources";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  AgentDetail,
  ApiClientDetail,
  BasicDetail,
  Source,
  SourceDetail,
  SourceStatus,
  SourceType,
  SourceTypeMeta,
  SourcesKpi,
  SourcesResponse,
  WebhookDetail,
} from "@portal/mocks/sources";
export { SOURCE_STATUS_TONE, SOURCE_TYPE_META } from "@portal/mocks/sources";

/** GET /api/v1/sources?tier=… — KPI strip + the sources table for the tier. */
export async function fetchSources(tier: Tier): Promise<SourcesResponse> {
  return httpJson<SourcesResponse>(
    `/api/v1/sources?tier=${encodeURIComponent(tier)}`,
  );
}
