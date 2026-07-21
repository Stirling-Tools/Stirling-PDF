import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildDocsNav, docsContentFor } from "@portal/mocks/docs";

function tierFrom(request: Request): Tier {
  const url = new URL(request.url);
  return (url.searchParams.get("tier") ?? "pro") as Tier;
}

export const docsHandlers = [
  http.get("/v1/docs/nav", async () => {
    await delay(120);
    return HttpResponse.json(buildDocsNav());
  }),

  http.get("/v1/docs/content", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(docsContentFor(tierFrom(request)));
  }),
];
