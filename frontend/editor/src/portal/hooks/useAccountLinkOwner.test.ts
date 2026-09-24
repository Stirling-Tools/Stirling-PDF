import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContextValue, AuthUser } from "@app/auth";

const auth = vi.hoisted<
  Pick<AuthContextValue, "isAdmin" | "loading"> & {
    user: Pick<AuthUser, "orgOwner">;
  }
>(() => ({ isAdmin: true, loading: false, user: { orgOwner: true } }));
vi.mock("@app/auth", () => ({ useAuth: () => auth }));
import { useAccountLinkOwner } from "@app/portal/hooks/useAccountLinkOwner";

beforeEach(() => {
  auth.isAdmin = true;
  auth.loading = false;
  auth.user.orgOwner = true;
});
it("allows the authenticated organization owner", () => {
  expect(renderHook(() => useAccountLinkOwner()).result.current).toBe(true);
});
it.each([false, undefined])(
  "does not treat an admin as the owner when ownership is %s",
  (orgOwner) => {
    auth.user.orgOwner = orgOwner;
    expect(renderHook(() => useAccountLinkOwner()).result.current).toBe(false);
  },
);
it("does not trust an ownership flag without the admin role", () => {
  auth.isAdmin = false;
  expect(renderHook(() => useAccountLinkOwner()).result.current).toBe(false);
});
it("waits for authentication before exposing billing actions", () => {
  auth.loading = true;
  expect(renderHook(() => useAccountLinkOwner()).result.current).toBe(false);
});
