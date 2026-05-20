import { httpJson } from "@app/api/http";
import type {
  ActivityEvent,
  KpiEntry,
  OnboardingStep,
  RegionHealth,
  UsageSeriesResponse,
} from "@app/mocks/home";
import type { Tier } from "@app/contexts/TierContext";

export type {
  ActivityEvent,
  ActivityKind,
  KpiEntry,
  OnboardingStep,
  RegionHealth,
  UsagePoint,
  UsageSeriesResponse,
} from "@app/mocks/home";

/** GET /v1/analytics/usage?window=30d */
export async function fetchUsageSeries(): Promise<UsageSeriesResponse> {
  return httpJson<UsageSeriesResponse>("/v1/analytics/usage?window=30d");
}

/** GET /v1/activity?limit=8 */
export async function fetchRecentActivity(): Promise<ActivityEvent[]> {
  return httpJson<ActivityEvent[]>("/v1/activity?limit=8");
}

/** GET /v1/home/kpis?tier=… */
export async function fetchHomeKpis(tier: Tier): Promise<KpiEntry[]> {
  return httpJson<KpiEntry[]>(`/v1/home/kpis?tier=${encodeURIComponent(tier)}`);
}

/** GET /v1/regions/health (Enterprise) */
export async function fetchRegionHealth(): Promise<RegionHealth[]> {
  return httpJson<RegionHealth[]>("/v1/regions/health");
}

/** GET /v1/onboarding (Free) */
export async function fetchOnboarding(): Promise<OnboardingStep[]> {
  return httpJson<OnboardingStep[]>("/v1/onboarding");
}
