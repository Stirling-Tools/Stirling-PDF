import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildSourcesResponse } from "@portal/mocks/sources";

export const sourcesHandlers = [
  http.get("/v1/sources", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildSourcesResponse(tier));
  }),
];
