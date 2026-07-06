import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildDocumentsResponse } from "@portal/mocks/documents";

export const documentsHandlers = [
  http.get("/v1/documents", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildDocumentsResponse(tier));
  }),
];
