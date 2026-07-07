import { apiClient } from "@portal/api/http";
import type {
  ActivityEvent,
  EditorDeployment,
  KpiEntry,
  OnboardingStep,
  RegionHealth,
  UsageSeriesResponse,
} from "@portal/mocks/home";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  ActivityEvent,
  ActivityKind,
  EditorDeployment,
  KpiEntry,
  OnboardingStep,
  PipelineStage,
  PipelineTemplate,
  RegionHealth,
  UsagePoint,
  UsageSeriesResponse,
} from "@portal/mocks/home";
export { PIPELINE_STAGES, PIPELINE_TEMPLATES } from "@portal/mocks/home";

/** GET /v1/analytics/usage?window=30d */
export async function fetchUsageSeries(): Promise<UsageSeriesResponse> {
  return apiClient.local.json<UsageSeriesResponse>(
    "/v1/analytics/usage?window=30d",
  );
}

/** GET /v1/activity?limit=8 */
export async function fetchRecentActivity(): Promise<ActivityEvent[]> {
  return apiClient.local.json<ActivityEvent[]>("/v1/activity?limit=8");
}

/** GET /v1/home/kpis?tier=… */
export async function fetchHomeKpis(tier: Tier): Promise<KpiEntry[]> {
  return apiClient.local.json<KpiEntry[]>(
    `/v1/home/kpis?tier=${encodeURIComponent(tier)}`,
  );
}

/** GET /v1/regions/health (Enterprise) */
export async function fetchRegionHealth(): Promise<RegionHealth[]> {
  return apiClient.local.json<RegionHealth[]>("/v1/regions/health");
}

/** GET /v1/onboarding?tier=… (Free / Processor setup checklist) */
export async function fetchOnboarding(tier: Tier): Promise<OnboardingStep[]> {
  return apiClient.local.json<OnboardingStep[]>(
    `/v1/onboarding?tier=${encodeURIComponent(tier)}`,
  );
}

/** GET /v1/editor/deployment (subscribed-tier deployed Editor status) */
export async function fetchEditorDeployment(): Promise<EditorDeployment> {
  return apiClient.local.json<EditorDeployment>("/v1/editor/deployment");
}
