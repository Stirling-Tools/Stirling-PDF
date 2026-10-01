import { http, HttpResponse } from "msw";

// The Classification policy only needs the app-config `aiEngineEnabled` flag to be
// on; its label vocabulary is a fixed built-in set (no team endpoint anymore).

export const classificationHandlers = [
  http.get("/api/v1/config/app-config", () =>
    HttpResponse.json({ aiEngineEnabled: true }),
  ),
];
