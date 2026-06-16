import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildGettingStartedResponse } from "@portal/mocks/gettingStarted";

export const gettingStartedHandlers = [
  http.get("/v1/getting-started", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildGettingStartedResponse(tier));
  }),
];
