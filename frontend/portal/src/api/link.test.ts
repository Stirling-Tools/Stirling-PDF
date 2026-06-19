import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { linkHandlers } from "@portal/mocks/handlers/link";
import { resetLinkStore } from "@portal/mocks/link";
import { fetchInstances, registerInstance, revokeInstance } from "@portal/api/link";

const server = setupServer(...linkHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => resetLinkStore());

describe("api/link", () => {
  it("fetches the instance list", async () => {
    const rows = await fetchInstances(null);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("deviceId");
  });

  it("registers an instance and it appears in the list", async () => {
    const before = (await fetchInstances(null)).length;
    const cred = await registerInstance(null, { name: "api-test" });
    expect(cred.deviceSecret).toMatch(/^sk_link_/);
    expect(cred.name).toBe("api-test");

    const after = await fetchInstances(null);
    expect(after.length).toBe(before + 1);
    expect(after.some((r) => r.instanceId === cred.instanceId)).toBe(true);
  });

  it("revokes an instance", async () => {
    const active = (await fetchInstances(null)).find((r) => !r.revoked)!;
    await revokeInstance(null, active.instanceId);
    const after = await fetchInstances(null);
    expect(after.find((r) => r.instanceId === active.instanceId)?.revoked).toBe(
      true,
    );
  });

  it("forwards the access token as a Bearer header", async () => {
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
