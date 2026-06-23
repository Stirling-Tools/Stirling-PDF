import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { pipelinesFor } from "@portal/mocks/pipelines";

export const pipelinesHandlers = [
  http.get("/v1/pipelines", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(pipelinesFor(tier));
  }),

  // Accepts the promote-to-policy submit so the UI can resolve. The real
  // backend would create a policy from the pipeline's stages; here it just
  // acknowledges. See TODO(backend) on api/pipelines.ts promoteToPolicy.
  http.post("/v1/pipelines/:id/promote-to-policy", async () => {
    await delay(120);
    return HttpResponse.json({ ok: true });
  }),
];
