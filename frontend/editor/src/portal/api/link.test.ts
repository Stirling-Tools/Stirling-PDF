import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { linkHandlers } from "@portal/mocks/handlers/link";
import { resetLinkStore } from "@portal/mocks/link";

// Mock the shared Supabase client used by apiClient.saas. The team-wide
// /instances + /instances/:id/revoke calls go to SaaS now (auto-attached
// Bearer = current Supabase access token). Hoisted so vi.mock can see it.
const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({
    data: { session: { access_token: "supabase_jwt_test" } },
  }),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
  configureSupabase: vi.fn(),
}));

// Pretend the SaaS base URL is configured so apiClient.saas calls don't throw
// SaasUnconfiguredError. MSW's wildcard handlers (`*/...`) intercept the
// absolute URL the same way they do the relative one.
vi.stubEnv("VITE_SAAS_API_URL", "https://saas.test.local");

import {
  fetchInstances,
  fetchLocalUsage,
  fetchStatus,
  revokeInstance,
  unlinkInstance,
} from "@portal/api/link";

const server = setupServer(...linkHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});
beforeEach(() => resetLinkStore());

describe("api/link — local backend (this instance)", () => {
  it("starts not-linked", async () => {
    const status = await fetchStatus();
    expect(status.linked).toBe(false);
  });

  it("never exposes the device credential in a status read", async () => {
    // Contract: the device secret is stored server-side and the portal never sees it.
    const status = await fetchStatus();
    expect(status).not.toHaveProperty("deviceSecret");
    expect(status).not.toHaveProperty("deviceId");
  });

  it("unlinks this instance", async () => {
    // unlink returns 204 (no body); the status is read back separately.
    await unlinkInstance();
    expect((await fetchStatus()).linked).toBe(false);
  });

  it("reads instance-local unsynced usage via the local endpoint", async () => {
    const usage = await fetchLocalUsage();
    expect(usage.totalUnsyncedUnits).toBe(
      usage.apiUnsyncedUnits +
        usage.aiUnsyncedUnits +
        usage.automationUnsyncedUnits,
    );
    expect(usage.totalUnsyncedUnits).toBeGreaterThanOrEqual(0);
  });
});

describe("api/link — SaaS backend (team-wide)", () => {
  it("fetches the instance list", async () => {
    const rows = await fetchInstances();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("deviceId");
  });

  it("revokes an instance", async () => {
    const active = (await fetchInstances()).find((r) => !r.revoked)!;
    await revokeInstance(active.instanceId);
    const after = await fetchInstances();
    expect(after.find((r) => r.instanceId === active.instanceId)?.revoked).toBe(
      true,
    );
  });

  it("hits the absolute SaaS URL with the Supabase JWT as Bearer", async () => {
    let seenUrl: string | null = null;
    let seenAuth: string | null = null;
    const capture = ({ request }: { request: Request }) => {
      if (request.url.includes("/account-link/instances")) {
        seenUrl = request.url;
        seenAuth = request.headers.get("authorization");
      }
    };
    server.events.on("request:start", capture);
    await fetchInstances();
    expect(seenUrl).toBe(
      "https://saas.test.local/api/v1/account-link/instances",
    );
    expect(seenAuth).toBe("Bearer supabase_jwt_test");
    server.events.removeAllListeners();
  });
});
