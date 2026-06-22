import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildProcurement } from "@portal/mocks/procurement";

function tierFrom(request: Request): Tier {
  const url = new URL(request.url);
  return (url.searchParams.get("tier") ?? "pro") as Tier;
}

export const procurementHandlers = [
  http.get("/v1/procurement", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(buildProcurement(tierFrom(request)));
  }),
];
