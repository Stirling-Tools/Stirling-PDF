import { http, HttpResponse, delay } from "msw";
import {
  listInstances,
  registerInstance,
  revokeInstance,
  type RegisterInstanceRequest,
} from "@portal/mocks/link";

/**
 * Account-link MSW handlers. Mutating the in-memory store in mocks/link.ts so
 * register/revoke behave like a real backend within a session — the list
 * reflects newly registered and revoked instances. Mirrors the real
 * AccountLinkController paths so MSW can be dropped with no code change.
 */
export const linkHandlers = [
  http.get("/api/v1/account-link/instances", async () => {
    await delay(120);
    return HttpResponse.json(listInstances());
  }),

  http.post("/api/v1/account-link/register", async ({ request }) => {
    await delay(120);
    let name: string | undefined;
    try {
      name = ((await request.json()) as RegisterInstanceRequest)?.name;
    } catch {
      // empty body — name stays undefined
    }
    return HttpResponse.json(registerInstance(name), { status: 201 });
  }),

  http.post(
    "/api/v1/account-link/instances/:instanceId/revoke",
    async ({ params }) => {
      await delay(120);
      const ok = revokeInstance(Number(params.instanceId));
      if (!ok) return new HttpResponse(null, { status: 404 });
      return new HttpResponse(null, { status: 204 });
    },
  ),
];
