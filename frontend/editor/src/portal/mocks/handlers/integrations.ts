import { http, HttpResponse } from "msw";

/**
 * Stored connections, for stories and the demo tour.
 *
 * Secrets are returned masked, exactly as the backend does — a fixture that handed back a real
 * secret would quietly teach the wrong thing about the contract.
 */
const CONNECTIONS = [
  {
    id: 1,
    integrationType: "S3",
    name: "Claims intake bucket",
    scope: "TEAM",
    ownerUserId: null,
    ownerTeamId: 1,
    enabled: true,
    locked: false,
    defaultAccess: "EXPLICIT_ONLY",
    config: {
      bucket: "acme-claims-inbox",
      region: "eu-west-2",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "********",
    },
    canManage: true,
    createdAt: "2026-07-02T09:12:00",
    updatedAt: "2026-07-02T09:12:00",
  },
  {
    id: 2,
    integrationType: "PURVIEW",
    name: "Contoso Purview",
    scope: "TEAM",
    ownerUserId: null,
    ownerTeamId: 1,
    enabled: true,
    locked: false,
    defaultAccess: "EXPLICIT_ONLY",
    config: {
      tenantId: "cb46c030-1825-4e81-a295-151c039dbf02",
      clientId: "8f2a1c44-9b21-4d0e-9c33-2b7e5a10d4f1",
      clientSecret: "********",
    },
    canManage: true,
    createdAt: "2026-07-11T14:03:00",
    updatedAt: "2026-07-16T08:40:00",
  },
  {
    id: 3,
    integrationType: "CONSIGNO",
    name: "Notarius (production)",
    scope: "TEAM",
    ownerUserId: null,
    ownerTeamId: 1,
    enabled: true,
    locked: false,
    defaultAccess: "EXPLICIT_ONLY",
    config: {
      baseUrl: "https://acme.consignocloud.com/api/v1",
      authType: "TOKEN_LOGIN",
      loginPath: "/auth/login",
      tokenResponseHeader: "X-Auth-Token",
      tokenHeaderName: "X-Auth-Token",
      loginHeaders: {
        "X-Client-Id": "acme-prod",
        "X-Client-Secret": "********",
      },
      loginBody: {
        username: "automation@acme.test",
        password: "********",
        tenantId: "acme",
      },
    },
    canManage: true,
    createdAt: "2026-07-14T11:25:00",
    updatedAt: "2026-07-14T11:25:00",
  },
  {
    id: 4,
    integrationType: "API",
    name: "Acme DLP scanner",
    scope: "TEAM",
    ownerUserId: null,
    ownerTeamId: 1,
    enabled: true,
    locked: false,
    defaultAccess: "EXPLICIT_ONLY",
    config: {
      baseUrl: "https://dlp.acme-security.example/v2",
      authType: "BEARER",
      token: "********",
      resultUrlHosts: ["cdn.acme-security.example"],
    },
    canManage: true,
    createdAt: "2026-07-15T16:47:00",
    updatedAt: "2026-07-15T16:47:00",
  },
];

export const integrationsHandlers = [
  http.get("*/api/v1/integrations", () => HttpResponse.json(CONNECTIONS)),
  // Stories show the admin's view; the server is the real gate.
  http.get("*/api/v1/integrations/capabilities", () =>
    HttpResponse.json({ customApi: true }),
  ),
  http.post("*/api/v1/integrations", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...CONNECTIONS[0],
      id: 99,
      ...body,
      canManage: true,
    });
  }),
  http.put("*/api/v1/integrations/:id", async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      ...CONNECTIONS[0],
      id: Number(params.id),
      ...body,
    });
  }),
  http.delete(
    "*/api/v1/integrations/:id",
    () => new HttpResponse(null, { status: 204 }),
  ),
];
