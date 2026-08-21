import { afterEach, describe, expect, it } from "vitest";
import {
  disablePortalDemoData,
  enablePortalDemoData,
  isPortalDemoDataActive,
  resolveDemoResponse,
} from "@portal/api/demoData";

describe("portal demo data seam", () => {
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
