import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildAgentsResponse } from "@portal/mocks/agents";

export const agentsHandlers = [
  http.get("/v1/agents", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildAgentsResponse(tier));
  }),
];
