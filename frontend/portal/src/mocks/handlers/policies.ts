import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildPoliciesResponse } from "@portal/mocks/policies";

export const policiesHandlers = [
  http.get("/v1/policies", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildPoliciesResponse(tier));
  }),
];
