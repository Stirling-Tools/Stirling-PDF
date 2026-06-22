import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { linkHandlers } from "@portal/mocks/handlers/link";
import { resetLinkStore } from "@portal/mocks/link";
import {
  fetchInstances,
  fetchStatus,
  linkInstance,
  revokeInstance,
  unlinkInstance,
} from "@portal/api/link";

const server = setupServer(...linkHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => resetLinkStore());

describe("api/link — local backend (this instance)", () => {
  it("starts not-linked", async () => {
    const status = await fetchStatus();
    expect(status.linked).toBe(false);
  });

  it("links this instance via the local endpoint, never returning a secret", async () => {
    const status = await linkInstance({ supabaseJwt: "jwt_abc", name: "node-1" });
    expect(status.linked).toBe(true);
    expect(status.name).toBe("node-1");
    // Contract: the device secret is stored server-side, never sent to the portal.
    expect(status).not.toHaveProperty("deviceSecret");
    expect(status).not.toHaveProperty("deviceId");
    expect(await (await fetchStatus()).linked).toBe(true);
  });

  it("unlinks this instance", async () => {
    await linkInstance({ supabaseJwt: "jwt_abc" });
    const status = await unlinkInstance();
    expect(status.linked).toBe(false);
  });

  it("forwards the SaaS JWT in the link body", async () => {
    let seenBody: unknown = null;
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/link")) {
        seenBody = await request.clone().json();
      }
    });
    await linkInstance({ supabaseJwt: "jwt_xyz", name: "n" });
    expect(seenBody).toMatchObject({ supabaseJwt: "jwt_xyz" });
    server.events.removeAllListeners();
  });
});

describe("api/link — SaaS backend (team-wide)", () => {
  it("fetches the instance list", async () => {
    const rows = await fetchInstances(null);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("deviceId");
  });

  it("revokes an instance", async () => {
    const active = (await fetchInstances(null)).find((r) => !r.revoked)!;
    await revokeInstance(null, active.instanceId);
    const after = await fetchInstances(null);
    expect(after.find((r) => r.instanceId === active.instanceId)?.revoked).toBe(
      true,
    );
  });

  it("forwards the admin access token as a Bearer header", async () => {
    let seen: string | null = null;
    const capture = ({ request }: { request: Request }) => {
      seen = request.headers.get("authorization");
    };
    server.events.on("request:start", capture);
    await fetchInstances("tok_123");
    expect(seen).toBe("Bearer tok_123");
    server.events.removeAllListeners();
  });
});
