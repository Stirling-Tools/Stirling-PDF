import { http, HttpResponse, delay } from "msw";
import { VERTICALS } from "@shared/data/endpoints";

export const endpointsHandlers = [
  http.get("/api/v1/endpoints", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const verticalKey = url.searchParams.get("vertical");
    if (verticalKey) {
      const v = VERTICALS.find((x) => x.key === verticalKey);
      return HttpResponse.json(v ? v.endpoints : []);
    }
    return HttpResponse.json(VERTICALS);
  }),
];
