import { httpJson } from "@portal/api/http";
import type { SourcesResponse } from "@portal/mocks/sources";

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

/** GET /api/v1/sources - KPI strip + the sources overview table for the admin. */
export async function fetchSources(): Promise<SourcesResponse> {
  return httpJson<SourcesResponse>("/api/v1/sources");
}
