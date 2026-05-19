import { http, HttpResponse, delay } from "msw";
import { ALL_ENDPOINTS, VERTICALS } from "@shared/data/endpoints";

export const endpointsHandlers = [
  http.get("/v1/endpoints", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const verticalKey = url.searchParams.get("vertical");
    if (verticalKey) {
      const v = VERTICALS.find((x) => x.key === verticalKey);
      return HttpResponse.json(v ? v.endpoints : []);
    }
    return HttpResponse.json(VERTICALS);
  }),

  http.get("/v1/endpoints/flat", async () => {
    await delay(120);
    return HttpResponse.json(ALL_ENDPOINTS);
  }),
];
