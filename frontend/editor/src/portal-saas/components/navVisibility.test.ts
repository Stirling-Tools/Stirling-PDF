import { describe, expect, it } from "vitest";

// Resolves to the SaaS override (src/portal-saas/components) via the @portal cascade.
import { HIDDEN_NAV_VIEWS } from "@portal/components/navVisibility";

describe("navVisibility (SaaS) — hidden nav entries", () => {
  it("hides the Infrastructure tab (not built for SaaS yet)", () => {
    expect(HIDDEN_NAV_VIEWS.has("infrastructure")).toBe(true);
  });
});
