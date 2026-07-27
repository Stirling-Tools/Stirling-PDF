import { describe, expect, it } from "vitest";
// Resolves to the SaaS override (src/portal-saas) via the @portal cascade.
import {
  GROUP_PROCESSOR,
  GROUP_PLATFORM,
} from "@portal/components/sidebarGroups";

describe("sidebarGroups (SaaS)", () => {
  it("inherits the processor group unchanged from base", () => {
    expect(GROUP_PROCESSOR.map((e) => e.id)).toEqual([
      "home",
      "sources",
      "policies",
      "pipelines",
      "documents",
    ]);
  });

  it("inherits the platform group unchanged from base", () => {
    expect(GROUP_PLATFORM.map((e) => e.id)).toEqual([
      "users",
      "integrations",
      "infrastructure",
      "usage",
      "docs",
    ]);
  });
});
