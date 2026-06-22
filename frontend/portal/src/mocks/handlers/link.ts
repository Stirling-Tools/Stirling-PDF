import { http, HttpResponse, delay } from "msw";
import {
  getLocalStatus,
  linkLocal,
  listInstances,
  revokeInstance,
  unlinkLocal,
  type LinkInstanceRequest,
} from "@portal/mocks/link";

/**
 * Account-link MSW handlers. Two surfaces:
 *
 *   - LOCAL backend (this instance): link / status / unlink. `link` mutates the
 *     in-memory store and flips local status so the surface behaves like a real
 *     backend within a session. The device secret stays server-side — never
 *     returned over the wire, matching the real contract.
 *   - SaaS backend (team-wide): instances / revoke.
 *
 * Mirrors the real AccountLinkController paths so MSW can be dropped with no code
 * change.
 */
export const linkHandlers = [
  http.get("/api/v1/account-link/status", async () => {
    await delay(120);
    return HttpResponse.json(getLocalStatus());
  }),

  http.post("/api/v1/account-link/link", async ({ request }) => {
    await delay(120);
    let name: string | undefined;
    try {
      name = ((await request.json()) as LinkInstanceRequest)?.name;
    } catch {
      // empty body — name stays undefined
    }
    return HttpResponse.json(linkLocal(name), { status: 201 });
  }),

  http.post("/api/v1/account-link/unlink", async () => {
    await delay(120);
    return HttpResponse.json(unlinkLocal());
  }),

  http.get("/api/v1/account-link/instances", async () => {
    await delay(120);
    return HttpResponse.json(listInstances());
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
