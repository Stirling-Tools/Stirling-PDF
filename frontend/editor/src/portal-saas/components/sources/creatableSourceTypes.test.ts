import { describe, expect, it } from "vitest";
// Resolves to the SaaS override (src/portal-saas) via the @portal cascade.
import { creatableSourceTypes } from "@portal/components/sources/creatableSourceTypes";

describe("creatableSourceTypes (SaaS)", () => {
  it("never offers server-local-disk sources (folder, webhook) in hosted deployments", () => {
    const offered = creatableSourceTypes().map((t) => t.type);
    expect(offered).not.toContain("folder");
    expect(offered).not.toContain("webhook");
  });

  it("still offers the cloud source types", () => {
    expect(creatableSourceTypes().map((t) => t.type)).toContain("s3");
  });
});
