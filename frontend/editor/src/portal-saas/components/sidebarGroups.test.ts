import { describe, expect, it } from "vitest";
// Resolves to the SaaS override (src/portal-saas) via the @portal cascade.
import {
  GROUP_PRIMARY,
  GROUP_OPERATIONAL,
  GROUP_PLATFORM,
} from "@portal/components/sidebarGroups";

describe("sidebarGroups (SaaS)", () => {
  it("drops Components from the operational nav", () => {
    expect(GROUP_OPERATIONAL.map((e) => e.id)).not.toContain("components");
  });

  it("inherits the other operational items from base", () => {
    expect(GROUP_OPERATIONAL.map((e) => e.id)).toEqual([
      "users",
      "sources",
      "policies",
      "pipelines",
      "documents",
    ]);
  });

  it("inherits the primary + platform groups unchanged", () => {
    expect(GROUP_PRIMARY.map((e) => e.id)).toEqual(["home"]);
    expect(GROUP_PLATFORM.map((e) => e.id)).toEqual([
      "infrastructure",
      "usage",
      "docs",
    ]);
  });
});
