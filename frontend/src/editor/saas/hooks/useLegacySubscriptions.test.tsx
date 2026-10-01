import {
  act,
  cleanup,
  renderHook as baseRenderHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLegacySubscriptions } from "@app/hooks/useLegacySubscriptions";
import type { LegacySubscription } from "@app/types/legacyBilling";
import { createAppQueryClient } from "@app/query/queryClient";
import { qk } from "@app/query/keys";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";

let client: QueryClient;

function renderHook<T>(callback: () => T) {
  return baseRenderHook(callback, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

let user: { id: string; is_anonymous?: boolean } | null;
let authLoading = false;
const fetchSubscriptions = vi.fn();
const portal = vi.fn();
const navigate = vi.fn();
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user, loading: authLoading }),
}));
vi.mock("@app/services/legacyBilling", () => ({
  fetchLegacySubscriptions: (...args: unknown[]) => fetchSubscriptions(...args),
  createLegacyPortalSession: () => portal(),
}));
vi.mock("@app/platform/openExternal", () => ({
  openExternal: (...args: unknown[]) => navigate(...args),
}));
const subscription: LegacySubscription = {
  id: "sub_1",
  plan: "pro",
  status: "active",
  currentPeriodEnd: null,
  teamId: null,
  teamAllowance: null,
};

describe("legacy billing ownership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    client = createAppQueryClient();
    user = { id: "owner" };
    authLoading = false;
    fetchSubscriptions.mockResolvedValue([subscription]);
    portal.mockResolvedValue("https://billing.stripe.com/p/session/test");
  });

  afterEach(() => {
    cleanup();
    client.clear();
    resetTabVisibility();
    vi.useRealTimers();
  });

  it("waits for authentication before deciding that the account has no subscription", () => {
    user = null;
    authLoading = true;
    const { result } = renderHook(() => useLegacySubscriptions());
    expect(result.current.loading).toBe(true);
    expect(fetchSubscriptions).not.toHaveBeenCalled();
  });

  it("does not query billing or mint a portal for anonymous users", async () => {
    user = { id: "guest", is_anonymous: true };
    const { result } = renderHook(() => useLegacySubscriptions());
    await act(() => result.current.openPortal());
    expect(fetchSubscriptions).not.toHaveBeenCalled();
    expect(portal).not.toHaveBeenCalled();
  });

  it("discards the previous owner's records when accounts change during a request", async () => {
    let resolveOwner!: (value: LegacySubscription[]) => void;
    fetchSubscriptions.mockImplementationOnce(
      () =>
        new Promise<LegacySubscription[]>((resolve) => {
          resolveOwner = resolve;
        }),
    );
    const { result, rerender } = renderHook(() => useLegacySubscriptions());
    user = { id: "other" };
    fetchSubscriptions.mockResolvedValue([]);
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => resolveOwner([subscription]));
    expect(result.current.subscriptions).toEqual([]);
    await act(() => result.current.openPortal());
    expect(portal).not.toHaveBeenCalled();
  });

  it("refreshes after returning from Stripe and removes ended subscriptions", async () => {
    const { result } = renderHook(() => useLegacySubscriptions());
    await waitFor(() =>
      expect(result.current.subscriptions).toEqual([subscription]),
    );
    await act(() => result.current.openPortal());
    expect(navigate).toHaveBeenCalledWith(
      "https://billing.stripe.com/p/session/test",
    );
    fetchSubscriptions.mockResolvedValue([]);
    act(() => {
      setTabHidden(true);
      setTabHidden(false);
    });
    await waitFor(() => expect(result.current.subscriptions).toEqual([]));
  });

  it("exposes a retryable lookup failure without claiming the owner has a free plan", async () => {
    fetchSubscriptions.mockRejectedValueOnce(new Error("Offline"));
    const { result } = renderHook(() => useLegacySubscriptions());
    await waitFor(() => expect(result.current.loadError).toBe(true));
    fetchSubscriptions.mockResolvedValue([subscription]);
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(result.current.subscriptions).toEqual([subscription]),
    );
    expect(result.current.loadError).toBe(false);
    portal.mockRejectedValueOnce(new Error("Stripe unavailable"));
    await act(() => result.current.openPortal());
    expect(result.current.portalError).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shares the in-flight lookup and fresh cache across consumers and remounts", async () => {
    const first = renderHook(() => useLegacySubscriptions());
    const second = renderHook(() => useLegacySubscriptions());
    await waitFor(() =>
      expect(second.result.current.subscriptions).toEqual([subscription]),
    );
    expect(first.result.current.subscriptions).toEqual([subscription]);
    expect(fetchSubscriptions).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
    const remounted = renderHook(() => useLegacySubscriptions());
    expect(remounted.result.current.subscriptions).toEqual([subscription]);
    expect(remounted.result.current.loading).toBe(false);
    await act(async () => {});
    expect(fetchSubscriptions).toHaveBeenCalledTimes(1);
  });

  it("hides cached records when authentication is pending or the owner signs out", async () => {
    const { result, rerender } = renderHook(() => useLegacySubscriptions());
    await waitFor(() =>
      expect(result.current.subscriptions).toEqual([subscription]),
    );
    authLoading = true;
    rerender();
    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.loading).toBe(true);
    act(() => result.current.refresh());
    await act(() => result.current.openPortal());
    expect(fetchSubscriptions).toHaveBeenCalledTimes(1);
    expect(portal).not.toHaveBeenCalled();
    user = null;
    authLoading = false;
    rerender();
    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("does not show one owner's cached plan to another owner", async () => {
    const { result, rerender } = renderHook(() => useLegacySubscriptions());
    await waitFor(() =>
      expect(result.current.subscriptions).toEqual([subscription]),
    );
    fetchSubscriptions.mockResolvedValue([]);
    user = { id: "other" };
    rerender();
    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subscriptions).toEqual([]);
    expect(fetchSubscriptions).toHaveBeenLastCalledWith("other");
  });

  it("ignores a portal response after the account changes", async () => {
    let resolvePortal!: (url: string) => void;
    portal.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolvePortal = resolve;
        }),
    );
    const { result, rerender } = renderHook(() => useLegacySubscriptions());
    await waitFor(() =>
      expect(result.current.subscriptions).toEqual([subscription]),
    );
    let opening!: Promise<void>;
    act(() => {
      opening = result.current.openPortal();
    });
    user = { id: "other" };
    fetchSubscriptions.mockResolvedValue([]);
    rerender();
    await act(async () => {
      resolvePortal("https://billing.stripe.com/p/session/test");
      await opening;
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(
      client.getQueryState(qk.legacySubscriptions("owner"))?.isInvalidated,
    ).toBe(false);
  });

  describe("query freshness", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it("does not refetch for window focus or a tab return while fresh", async () => {
      const { result } = renderHook(() => useLegacySubscriptions());
      await waitFor(() =>
        expect(result.current.subscriptions).toEqual([subscription]),
      );
      await act(async () => {
        for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("focus"));
        setTabHidden(true);
        setTabHidden(false);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchSubscriptions).toHaveBeenCalledTimes(1);
    });

    it("pauses polling while hidden and refreshes a stale plan on return", async () => {
      const { result } = renderHook(() => useLegacySubscriptions());
      await waitFor(() =>
        expect(result.current.subscriptions).toEqual([subscription]),
      );
      act(() => setTabHidden(true));
      await act(() => vi.advanceTimersByTimeAsync(90_000));
      expect(fetchSubscriptions).toHaveBeenCalledTimes(1);
      fetchSubscriptions.mockResolvedValue([]);
      act(() => setTabHidden(false));
      await waitFor(() => expect(result.current.subscriptions).toEqual([]));
      expect(fetchSubscriptions).toHaveBeenCalledTimes(2);
    });

    it("keeps the plan visible during a background refresh and a failed poll", async () => {
      const { result } = renderHook(() => useLegacySubscriptions());
      await waitFor(() =>
        expect(result.current.subscriptions).toEqual([subscription]),
      );
      let rejectPoll!: (reason: Error) => void;
      fetchSubscriptions.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPoll = reject;
          }),
      );
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(fetchSubscriptions).toHaveBeenCalledTimes(2);
      expect(result.current.subscriptions).toEqual([subscription]);
      expect(result.current.loading).toBe(false);
      await act(async () => {
        rejectPoll(new Error("Offline"));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.subscriptions).toEqual([subscription]);
      expect(result.current.loadError).toBe(false);
      fetchSubscriptions.mockResolvedValue([]);
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      await waitFor(() => expect(result.current.subscriptions).toEqual([]));
    });
  });
});
