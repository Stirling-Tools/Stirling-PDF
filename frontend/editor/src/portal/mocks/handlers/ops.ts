import { http, HttpResponse, delay } from "msw";
import { FEATURED_OPS, OP_RESULTS } from "@portal/mocks/ops";

export const opsHandlers = [
  http.get("/v1/ops/featured", async () => {
    await delay(120);
    return HttpResponse.json(FEATURED_OPS);
  }),

  http.post("/v1/ops/:opId/run", async ({ params }) => {
    const start = performance.now();
    await delay(800 + Math.random() * 200);
    const opId = String(params.opId);
    const result = OP_RESULTS[opId];
    if (!result) {
      return HttpResponse.json(
        { error: `Unknown op: ${opId}` },
        { status: 404 },
      );
    }
    const enriched =
      opId === "sign-output"
        ? { ...result, signed_at: new Date().toISOString() }
        : result;
    return HttpResponse.json({
      result: enriched,
      durationMs: Math.round(performance.now() - start),
    });
  }),
];
