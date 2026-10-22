import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
// Resolves to the SaaS override (src/portal-saas) via the @portal cascade.
import { useAdminNavVisible } from "@portal/hooks/useAdminNavVisible";

describe("useAdminNavVisible (SaaS)", () => {
  it("keeps admin-gated entries visible, since the billing page renders for any member", () => {
    expect(renderHook(() => useAdminNavVisible()).result.current).toBe(true);
  });
});
