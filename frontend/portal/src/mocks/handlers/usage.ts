import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import {
  buildBillingHistory,
  buildBillingSummary,
  buildUsagePayload,
  PLAN_OPTIONS,
} from "@portal/mocks/usage";

function tierFrom(request: Request): Tier {
  const url = new URL(request.url);
  return (url.searchParams.get("tier") ?? "pro") as Tier;
}

export const usageHandlers = [
  http.get("/v1/billing/usage", async () => {
    await delay(120);
    return HttpResponse.json(buildUsagePayload());
  }),

  http.get("/v1/billing/summary", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(buildBillingSummary(tierFrom(request)));
  }),

  http.get("/v1/billing/plans", async () => {
    await delay(120);
    return HttpResponse.json(PLAN_OPTIONS);
  }),

  http.get("/v1/billing/history", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(buildBillingHistory(tierFrom(request)));
  }),
];
