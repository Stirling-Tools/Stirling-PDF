import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import {
  apiKeysFor,
  auditLogFor,
  modelsResponseFor,
  recentDeploymentsFor,
  regionsFor,
  securityFor,
  storageFor,
} from "@portal/mocks/infrastructure";

function tierFrom(request: Request): Tier {
  const url = new URL(request.url);
  return (url.searchParams.get("tier") ?? "pro") as Tier;
}

export const infrastructureHandlers = [
  http.get("/v1/infrastructure/deployments", async ({ request }) => {
    await delay(120);
    const tier = tierFrom(request);
    return HttpResponse.json({
      regions: regionsFor(tier),
      recent: recentDeploymentsFor(tier),
    });
  }),

  http.get("/v1/infrastructure/api-keys", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(apiKeysFor(tierFrom(request)));
  }),

  http.get("/v1/infrastructure/security", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(securityFor(tierFrom(request)));
  }),

  http.get("/v1/infrastructure/models", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(modelsResponseFor(tierFrom(request)));
  }),

  http.get("/v1/infrastructure/storage", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(storageFor(tierFrom(request)));
  }),

  http.get("/v1/infrastructure/audit-log", async ({ request }) => {
    await delay(120);
    return HttpResponse.json(auditLogFor(tierFrom(request)));
  }),
];
