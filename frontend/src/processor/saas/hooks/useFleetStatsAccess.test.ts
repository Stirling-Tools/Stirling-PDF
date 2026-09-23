import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useFleetStatsAccess } from "@portal/hooks/useFleetStatsAccess";

const state = vi.hoisted(() => ({
  auth: {
    loading: false,
    error: null as Error | null,
    session: {} as object | null,
    user: { id: "member" } as { id: string } | null,
    isAnonymous: false,
  },
}));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => state.auth }));

beforeEach(() => {
  state.auth = {
    loading: false,
    error: null,
    session: {},
    user: { id: "member" },
    isAnonymous: false,
  };
});

it("allows a signed-in SaaS member without requiring an admin role", () => {
  expect(renderHook(() => useFleetStatsAccess()).result.current).toBe("member");
});

it.each([
  { loading: true },
  { session: null },
  { user: null },
  { isAnonymous: true },
  { error: new Error("Session unavailable") },
])("denies an unresolved or anonymous SaaS session: %j", (override) => {
  Object.assign(state.auth, override);
  expect(renderHook(() => useFleetStatsAccess()).result.current).toBeNull();
});
