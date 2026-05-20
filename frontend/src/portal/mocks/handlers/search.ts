import { http, HttpResponse } from "msw";
import { QUICK_ACTIONS } from "@app/mocks/search";

export const searchHandlers = [
  http.get("/v1/search/quick-actions", () => {
    return HttpResponse.json(QUICK_ACTIONS);
  }),
];
