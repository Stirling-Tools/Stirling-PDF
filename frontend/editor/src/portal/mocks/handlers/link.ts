import { http, HttpResponse, delay } from "msw";
import {
  getLocalStatus,
  getLocalUsage,
  linkLocal,
  listInstances,
  revokeInstance,
  unlinkLocal,
} from "@portal/mocks/link";

/**
 * Account-link MSW handlers. Two surfaces:
 *
 *   - LOCAL backend (this instance): the connect handshake, status and unlink.
 *     `connect/complete` mutates the in-memory store and flips local status so the
 *     surface behaves like a real backend within a session. The device secret stays
 *     server-side — never returned over the wire, matching the real contract.
 *   - SaaS backend (team-wide): instances / revoke.
 *
 * Mirrors the real controller paths so MSW can be dropped with no code change.
 */
export const linkHandlers = [
  http.get("/api/v1/account-link/status", async () => {
    await delay(120);
    return HttpResponse.json(getLocalStatus());
  }),

  // Opening a handshake hands back where to send the admin. The real backend gets
  // that URL from SaaS rather than composing it, so the mock returns one too.
  http.post("*/api/v1/account-link/connect/start", async () => {
    await delay(120);
    return HttpResponse.json({
      phase: "PENDING",
      authorizeUrl: "https://app.stirling.test/link?request=mock-request",
      secondsRemaining: 900,
      teamId: null,
    });
  }),

  http.post("*/api/v1/account-link/connect/reauth", async () => {
    await delay(120);
    return HttpResponse.json({
      phase: "PENDING",
      authorizeUrl: "https://app.stirling.test/link?request=mock-reauth",
      secondsRemaining: 900,
      teamId: null,
    });
  }),

  // The callback's completion step. Flips the store to linked, as a real claim would.
  http.post("*/api/v1/account-link/connect/complete", async () => {
    await delay(120);
    linkLocal("mock-server");
    return HttpResponse.json({
      phase: "LINKED",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: 7,
    });
  }),

  http.get("*/api/v1/account-link/connect/status", async () => {
    await delay(120);
    const linked = getLocalStatus().linked;
    return HttpResponse.json({
      phase: linked ? "LINKED" : "NONE",
      authorizeUrl: null,
      secondsRemaining: null,
      teamId: linked ? 7 : null,
    });
  }),

  http.get("/api/v1/account-link/usage", async () => {
    await delay(120);
    return HttpResponse.json(getLocalUsage());
  }),

  http.post("/api/v1/account-link/unlink", async () => {
    await delay(120);
    // Clear local link state, then 204 (no body) to match the real backend.
    unlinkLocal();
    return new HttpResponse(null, { status: 204 });
  }),

  // Manual sync trigger — the real backend runs a sync + entitlement refresh and
  // returns 204 (or 409 when metering is off). The portal fires it best-effort
  // after a checkout completes; the mock just acknowledges.
  http.post("/api/v1/account-link/sync-now", async () => {
    await delay(120);
    return new HttpResponse(null, { status: 204 });
  }),

  // Team-wide list/revoke are SaaS-direct now (apiClient.saas calls the
  // absolute VITE_SAAS_API_URL). Wildcard so the same handlers intercept both
  // the relative pattern (legacy / direct-MSW usage) and any absolute SaaS
  // base URL configured in dev/test.
  http.get("*/api/v1/account-link/instances", async () => {
    await delay(120);
    return HttpResponse.json(listInstances());
  }),

  http.post(
    "*/api/v1/account-link/instances/:instanceId/revoke",
    async ({ params }) => {
      await delay(120);
      const ok = revokeInstance(Number(params.instanceId));
      if (!ok) return new HttpResponse(null, { status: 404 });
      return new HttpResponse(null, { status: 204 });
    },
  ),
];
