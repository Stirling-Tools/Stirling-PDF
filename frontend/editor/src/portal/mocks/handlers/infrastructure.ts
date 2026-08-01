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

  // Real backend route; wildcard prefix intercepts both local (same-origin) and
  // SaaS (absolute) callers.
  http.get(
    "*/api/v1/proprietary/ui-data/infrastructure/api-keys",
    async ({ request }) => {
      await delay(120);
      return HttpResponse.json(apiKeysFor(tierFrom(request)));
    },
  ),

  // Create returns a one-time secret; the mock is non-persistent (dev/Storybook only).
  http.post(
    "*/api/v1/proprietary/ui-data/infrastructure/api-keys",
    async ({ request }) => {
      await delay(120);
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
      };
      return HttpResponse.json({
        key: {
          id: `key-${Date.now()}`,
          name: body.name ?? "New key",
          prefix: "sk_demo0000",
          created: "2026-07-10",
          lastUsed: "Never",
          status: "active",
          usageToday: 0,
          usageMonth: 0,
          usageTotal: 0,
        },
        secret: "sk_live_demo_key_rotate_in_prod",
      });
    },
  ),

  http.delete(
    "*/api/v1/proprietary/ui-data/infrastructure/api-keys/:id",
    async () => {
      await delay(120);
      return new HttpResponse(null, { status: 204 });
    },
  ),

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

  // Mirrors the real backend route. Wildcard prefix so it intercepts both the
  // self-hosted apiClient.local call (same-origin) and the SaaS apiClient.saas
  // call (absolute VITE_SAAS_API_URL).
  http.get(
    "*/api/v1/proprietary/ui-data/infrastructure/audit-log",
    async ({ request }) => {
      await delay(120);
      return HttpResponse.json(auditLogFor(tierFrom(request)));
    },
  ),

  // Sample audit export so the export modal downloads something with mocks on.
  http.get("*/api/v1/proprietary/ui-data/audit-export", async ({ request }) => {
    await delay(200);
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const rows = [
      {
        date: "2026-07-07 18:59:31",
        username: "carol.diaz@acme.com",
        ipaddress: "10.0.3.21",
        tool: "compress-pdf",
        documentName: "purchase-order-6610.pdf",
        outcome: "success",
      },
      {
        date: "2026-07-07 18:40:50",
        username: "alice.chen@acme.com",
        ipaddress: "10.0.0.161",
        tool: "login",
        documentName: "",
        outcome: "success",
      },
      {
        date: "2026-07-07 15:25:06",
        username: "admin@stirlingpdf.com",
        ipaddress: "10.0.1.4",
        tool: "add-password",
        documentName: "scan-batch-0142.pdf",
        outcome: "failure",
      },
    ];
    if (format === "json") {
      return HttpResponse.json(rows);
    }
    const header = "date,username,ipaddress,tool,documentName,outcome";
    const body = rows
      .map((r) =>
        [
          r.date,
          r.username,
          r.ipaddress,
          r.tool,
          r.documentName,
          r.outcome,
        ].join(","),
      )
      .join("\n");
    return new HttpResponse(`${header}\n${body}\n`, {
      headers: { "Content-Type": "text/csv" },
    });
  }),
];
