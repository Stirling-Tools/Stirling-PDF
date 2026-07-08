import { http, HttpResponse, delay } from "msw";
import type {
  IntegrationConfig,
  IntegrationConfigRequest,
} from "@portal/api/integrations";
import type { GrantRequest, ResourceGrant } from "@portal/api/access";

/**
 * Stateful mock for the Integrations + access-control (ResourceGrant) surfaces so
 * the portal works fully offline with mocks on. Mirrors the real backend:
 * `/api/v1/integrations` (IntegrationConfigController) and
 * `/api/v1/admin/access/grants` (ResourceGrantController). With mocks OFF these
 * fall through to the real backend like any other `/api/v1/...` call.
 */

const SECRET_HINTS = [
  "secret",
  "password",
  "token",
  "apikey",
  "accesskey",
  "credential",
  "privatekey",
];

function isSecret(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_HINTS.some((h) => k.includes(h));
}

/** Mask secret values for display, like the backend SecretMasker. */
function mask(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = isSecret(k) && v != null && v !== "" ? "********" : v;
  }
  return out;
}

/** Keep the stored secret when the client echoes the mask or a blank. */
function merge(
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...incoming };
  for (const [k, v] of Object.entries(incoming)) {
    if (isSecret(k) && (v === "********" || v === "" || v == null)) {
      if (k in stored) out[k] = stored[k];
      else delete out[k];
    }
  }
  return out;
}

let configStore: IntegrationConfig[] = [
  {
    id: 101,
    integrationType: "API",
    name: "Billing API",
    scope: "SERVER",
    ownerUserId: null,
    ownerTeamId: null,
    enabled: true,
    locked: false,
    defaultAccess: "ORG_ALL",
    config: { baseUrl: "https://api.billing.acme.com", apiKey: "sk_live_xxx" },
    canManage: true,
    createdAt: "2026-01-02T10:00:00",
    updatedAt: "2026-01-02T10:00:00",
  },
  {
    id: 102,
    integrationType: "MCP",
    name: "Docs MCP",
    scope: "USER",
    ownerUserId: 1,
    ownerTeamId: null,
    enabled: true,
    locked: false,
    defaultAccess: "EXPLICIT_ONLY",
    config: { url: "https://mcp.acme.com", token: "mcp_tok_xxx" },
    canManage: true,
    createdAt: "2026-01-03T10:00:00",
    updatedAt: "2026-01-03T10:00:00",
  },
];

// Seeded so the Users portal-access column shows a "Granted" state for user 2.
let grantStore: ResourceGrant[] = [
  {
    id: 1,
    resourceType: "PORTAL",
    resourceId: "",
    principalType: "USER",
    principalId: 2,
    permission: "USE",
    createdAt: "2026-01-04T10:00:00",
  },
];

let configSeq = 200;
let grantSeq = 100;

function view(c: IntegrationConfig): IntegrationConfig {
  return { ...c, config: mask(c.config) };
}

export const integrationsHandlers = [
  // ── integration configs ──────────────────────────────────────────────
  http.get("/api/v1/integrations", async () => {
    await delay(100);
    return HttpResponse.json(configStore.map(view));
  }),

  http.post("/api/v1/integrations", async ({ request }) => {
    await delay(100);
    const body = (await request.json()) as IntegrationConfigRequest;
    const now = "2026-01-05T10:00:00";
    const created: IntegrationConfig = {
      id: (configSeq += 1),
      integrationType: body.integrationType ?? "API",
      name: body.name ?? "Untitled",
      scope: body.scope ?? "USER",
      ownerUserId: body.scope === "USER" ? 1 : null,
      ownerTeamId: body.ownerTeamId ?? null,
      enabled: body.enabled ?? true,
      locked: body.locked ?? false,
      defaultAccess: body.defaultAccess ?? "EXPLICIT_ONLY",
      config: (body.config as Record<string, unknown>) ?? {},
      canManage: true,
      createdAt: now,
      updatedAt: now,
    };
    configStore = [...configStore, created];
    return HttpResponse.json(view(created));
  }),

  http.put("/api/v1/integrations/:id", async ({ params, request }) => {
    await delay(100);
    const id = Number(params.id);
    const existing = configStore.find((c) => c.id === id);
    if (!existing) return new HttpResponse(null, { status: 404 });
    const body = (await request.json()) as IntegrationConfigRequest;
    const updated: IntegrationConfig = {
      ...existing,
      name: body.name ?? existing.name,
      enabled: body.enabled ?? existing.enabled,
      config: body.config
        ? merge(existing.config, body.config as Record<string, unknown>)
        : existing.config,
      updatedAt: "2026-01-06T10:00:00",
    };
    configStore = configStore.map((c) => (c.id === id ? updated : c));
    return HttpResponse.json(view(updated));
  }),

  http.delete("/api/v1/integrations/:id", async ({ params }) => {
    await delay(100);
    const id = Number(params.id);
    configStore = configStore.filter((c) => c.id !== id);
    grantStore = grantStore.filter(
      (g) =>
        !(
          g.resourceType === "INTEGRATION_CONFIG" && g.resourceId === String(id)
        ),
    );
    return new HttpResponse(null, { status: 204 });
  }),

  // ── resource grants ──────────────────────────────────────────────────
  http.get("/api/v1/admin/access/grants", async ({ request }) => {
    await delay(80);
    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId") ?? "";
    const rows = grantStore.filter(
      (g) =>
        g.resourceType === resourceType &&
        (resourceType === "PORTAL" ? true : g.resourceId === resourceId),
    );
    return HttpResponse.json(rows);
  }),

  http.get("/api/v1/admin/access/grants/by-principal", async ({ request }) => {
    await delay(80);
    const url = new URL(request.url);
    const principalType = url.searchParams.get("principalType");
    const principalId = Number(url.searchParams.get("principalId"));
    return HttpResponse.json(
      grantStore.filter(
        (g) =>
          g.principalType === principalType && g.principalId === principalId,
      ),
    );
  }),

  http.post("/api/v1/admin/access/grants", async ({ request }) => {
    await delay(80);
    const body = (await request.json()) as GrantRequest;
    const existing = grantStore.find(
      (g) =>
        g.resourceType === body.resourceType &&
        g.resourceId === (body.resourceId ?? "") &&
        g.principalType === body.principalType &&
        g.principalId === body.principalId,
    );
    if (existing) {
      existing.permission = body.permission ?? "USE";
      return HttpResponse.json(existing);
    }
    const created: ResourceGrant = {
      id: (grantSeq += 1),
      resourceType: body.resourceType,
      resourceId: body.resourceId ?? "",
      principalType: body.principalType,
      principalId: body.principalId,
      permission: body.permission ?? "USE",
      createdAt: "2026-01-07T10:00:00",
    };
    grantStore = [...grantStore, created];
    return HttpResponse.json(created);
  }),

  http.delete("/api/v1/admin/access/grants/:id", async ({ params }) => {
    await delay(80);
    const id = Number(params.id);
    grantStore = grantStore.filter((g) => g.id !== id);
    return HttpResponse.json({ message: "Grant revoked" });
  }),
];
