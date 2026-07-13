import { http, HttpResponse, delay } from "msw";
import type { ClassificationLabel } from "@app/data/classificationLabels";

// Mocks the endpoints the Classification policy relies on (real backend contract,
// so dropping MSW hits Stirling): the app-config `aiEngineEnabled` flag and the
// team label set (GET 204 → none, PUT persist).

let teamLabels: ClassificationLabel[] | null = null;

export const classificationHandlers = [
  http.get("/api/v1/config/app-config", () =>
    HttpResponse.json({ aiEngineEnabled: true }),
  ),

  http.get("/api/v1/classification/labels", async () => {
    await delay(80);
    if (teamLabels === null) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json({ labels: teamLabels });
  }),

  http.put("/api/v1/classification/labels", async ({ request }) => {
    await delay(80);
    const body = (await request.json()) as { labels?: ClassificationLabel[] };
    teamLabels = body.labels ?? [];
    return HttpResponse.json({ labels: teamLabels });
  }),
];
