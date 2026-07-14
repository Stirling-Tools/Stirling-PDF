import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildDocumentsResponse } from "@portal/mocks/documents";

export const documentsHandlers = [
  // Wildcard prefix so it intercepts both apiClient.local (same-origin) and
  // apiClient.saas (absolute VITE_SAAS_API_URL) calls.
  http.get("*/api/v1/proprietary/ui-data/documents", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildDocumentsResponse(tier));
  }),
];
