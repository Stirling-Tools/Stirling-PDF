import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  disablePortalDemoData,
  enablePortalDemoData,
  isPortalDemoDataActive,
  resolveDemoResponse,
} from "@portal/api/demoData";

describe("portal demo data seam", () => {
  // The first enable dynamically imports msw and the handler set. On a loaded
  // machine that one-time module load alone can blow a test's 5s budget, so
  // warm it here rather than charging it to whichever test happens to run
  // first.
  beforeAll(async () => {
    await enablePortalDemoData();
    disablePortalDemoData();
  }, 30_000);

  afterEach(() => disablePortalDemoData());

  it("is inert until enabled", async () => {
    expect(
      await resolveDemoResponse(
        new URL("/v1/notifications", window.location.origin),
        {},
      ),
    ).toBeUndefined();
    expect(isPortalDemoDataActive()).toBe(false);
  });

  it("answers from the fixture handlers while enabled", async () => {
    await enablePortalDemoData();
    const res = await resolveDemoResponse(
      new URL("/v1/notifications", window.location.origin),
      {},
    );
    expect(res?.status).toBe(200);
    const body = (await res?.json()) as unknown[];
    expect(body.length).toBeGreaterThan(0);
  });

  it("releases back to the network on disable", async () => {
    await enablePortalDemoData();
    disablePortalDemoData();
    expect(
      await resolveDemoResponse(
        new URL("/v1/notifications", window.location.origin),
        {},
      ),
    ).toBeUndefined();
  });

  it("returns undefined for routes no handler matches", async () => {
    await enablePortalDemoData();
    expect(
      await resolveDemoResponse(
        new URL("/v1/nope", window.location.origin),
        {},
      ),
    ).toBeUndefined();
  });
});
