import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@processor/contexts/TierContext";
import { buildEditorDeploymentResponse } from "@processor/mocks/editorDeploy";

export const editorDeployHandlers = [
  http.get("/v1/editor/deployment", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildEditorDeploymentResponse(tier));
  }),
];
