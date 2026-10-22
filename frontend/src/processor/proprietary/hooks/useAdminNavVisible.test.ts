import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const admin = { is: false };
vi.mock("@portal/hooks/usePortalAdmin", () => ({
  usePortalAdmin: () => admin.is,
}));

import { useAdminNavVisible } from "@portal/hooks/useAdminNavVisible";

describe("useAdminNavVisible (self-hosted)", () => {
  it("follows server-admin status, which is what the gated entries mean", () => {
    admin.is = true;
    expect(renderHook(() => useAdminNavVisible()).result.current).toBe(true);

    admin.is = false;
    expect(renderHook(() => useAdminNavVisible()).result.current).toBe(false);
  });
});
