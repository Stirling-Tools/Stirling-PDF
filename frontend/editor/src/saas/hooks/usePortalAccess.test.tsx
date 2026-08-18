import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook as baseRenderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const get = vi.fn();
let currentUserId: string | null = null;

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
  },
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: currentUserId ? { id: currentUserId } : null }),
}));

const { usePortalAccess } = await import("@app/hooks/usePortalAccess");

function meReturning(portalAccess: boolean) {
  return { data: { user: { portalAccess } } };
}

// A fresh client per render, so one test's cached answer can't satisfy the
// next — each case exercises a cold cache unless it deliberately shares one.
let client: QueryClient;

function renderHook<T>(cb: () => T) {
  return baseRenderHook(cb, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("usePortalAccess", () => {
  beforeEach(() => {
    get.mockReset();
    currentUserId = null;
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
  });

  it("reports the backend's answer for the signed-in user", async () => {
    currentUserId = "admin-1";
    get.mockResolvedValue(meReturning(true));

    const { result } = renderHook(() => usePortalAccess());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("re-asks the backend when a different user signs in without a reload", async () => {
    // An admin gets a yes...
    currentUserId = "admin-1";
    get.mockResolvedValue(meReturning(true));
    const { result, rerender } = renderHook(() => usePortalAccess());
    await waitFor(() => expect(result.current).toBe(true));

    // ...then Supabase swaps the identity in place (signed out in another
    // tab, revoked session, new sign-in) — no page load in between.
    currentUserId = "member-2";
    get.mockResolvedValue(meReturning(false));
    rerender();

    // The member must not inherit the admin's answer.
    await waitFor(() => expect(result.current).toBe(false));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("drops the answer when the user signs out", async () => {
    currentUserId = "admin-1";
    get.mockResolvedValue(meReturning(true));
    const { result, rerender } = renderHook(() => usePortalAccess());
    await waitFor(() => expect(result.current).toBe(true));

    currentUserId = null;
    rerender();

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("reports no access, and asks nothing, for a guest", () => {
    currentUserId = null;

    const { result } = renderHook(() => usePortalAccess());

    expect(result.current).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("treats a failed lookup as no access, and a later mount asks again", async () => {
    currentUserId = "admin-1";
    get.mockRejectedValueOnce(new Error("401"));
    const first = renderHook(() => usePortalAccess());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBe(false);
    first.unmount();

    // The failure isn't sticky — a cold cache asks again.
    client.clear();
    get.mockResolvedValue(meReturning(true));
    const second = renderHook(() => usePortalAccess());
    await waitFor(() => expect(second.result.current).toBe(true));
  });

  it("ignores a response that lands after unmount", async () => {
    currentUserId = "admin-1";
    let resolveMe: (v: unknown) => void = () => {};
    get.mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => usePortalAccess());
    unmount();
    resolveMe(meReturning(true));

    // No state update on an unmounted hook (React would warn); the stale
    // answer is simply dropped.
    expect(result.current).toBe(false);
  });
});
