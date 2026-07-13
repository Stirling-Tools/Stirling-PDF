import { describe, expect, it } from "vitest";
// Resolves to the SaaS override (src/portal-saas) via the @portal cascade.
import { creatableSourceTypes } from "@portal/components/sources/creatableSourceTypes";

describe("creatableSourceTypes (SaaS)", () => {
  it("never offers folder sources: hosted deployments do not read the server filesystem", () => {
    expect(creatableSourceTypes().map((t) => t.type)).not.toContain("folder");
  });

  it("still offers the cloud source types", () => {
    expect(creatableSourceTypes().map((t) => t.type)).toContain("s3");
  });
});
