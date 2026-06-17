import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import { buildSettingsSnapshot } from "@portal/mocks/settings";

export const settingsHandlers = [
  http.get("/v1/settings", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const tier = (url.searchParams.get("tier") ?? "pro") as Tier;
    return HttpResponse.json(buildSettingsSnapshot(tier));
  }),
];
