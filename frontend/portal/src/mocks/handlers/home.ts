import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import {
  buildUsageSeries,
  buildUsageSeriesResponse,
  enterpriseKpisFor,
  FREE_KPIS,
  FREE_ONBOARDING,
  proKpisFor,
  RECENT_ACTIVITY,
  REGION_HEALTH,
  type KpiEntry,
} from "@portal/mocks/home";

function kpisFor(tier: Tier): KpiEntry[] {
  if (tier === "free") return FREE_KPIS;
  const docs30d = buildUsageSeries().reduce((sum, p) => sum + p.value, 0);
  if (tier === "enterprise") return enterpriseKpisFor(docs30d);
  return proKpisFor(docs30d);
}

export const homeHandlers = [
  http.get("/v1/analytics/usage", async () => {
    await delay(120);
    return HttpResponse.json(buildUsageSeriesResponse());
  }),

  http.get("/v1/activity", async () => {
    await delay(120);
    return HttpResponse.json(RECENT_ACTIVITY);
  }),

  http.get("/v1/home/kpis", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(kpisFor(tier));
  }),

  http.get("/v1/regions/health", async () => {
    await delay(120);
    return HttpResponse.json(REGION_HEALTH);
  }),

  http.get("/v1/onboarding", async () => {
    await delay(120);
    return HttpResponse.json(FREE_ONBOARDING);
  }),
];
