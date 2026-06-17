import { httpJson } from "@portal/api/http";
import type {
  ActivityEvent,
  KpiEntry,
  OnboardingStep,
  RegionHealth,
  UsageSeriesResponse,
} from "@portal/mocks/home";
import type { Tier } from "@portal/contexts/TierContext";

export type {
  ActivityEvent,
  ActivityKind,
  KpiEntry,
  OnboardingStep,
  RegionHealth,
  UsagePoint,
  UsageSeriesResponse,
} from "@portal/mocks/home";

/** GET /api/v1/analytics/usage?window=30d */
export async function fetchUsageSeries(): Promise<UsageSeriesResponse> {
  return httpJson<UsageSeriesResponse>("/api/v1/analytics/usage?window=30d");
}

/** GET /api/v1/activity?limit=8 */
export async function fetchRecentActivity(): Promise<ActivityEvent[]> {
  return httpJson<ActivityEvent[]>("/api/v1/activity?limit=8");
}

/** GET /api/v1/home/kpis?tier=… */
export async function fetchHomeKpis(tier: Tier): Promise<KpiEntry[]> {
  return httpJson<KpiEntry[]>(
    `/api/v1/home/kpis?tier=${encodeURIComponent(tier)}`,
  );
}

/** GET /api/v1/regions/health (Enterprise) */
export async function fetchRegionHealth(): Promise<RegionHealth[]> {
  return httpJson<RegionHealth[]>("/api/v1/regions/health");
}

/** GET /api/v1/onboarding (Free) */
export async function fetchOnboarding(): Promise<OnboardingStep[]> {
  return httpJson<OnboardingStep[]>("/api/v1/onboarding");
}
