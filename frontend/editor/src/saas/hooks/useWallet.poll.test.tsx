import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expectConsole } from "@app/tests/failOnConsole";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";

const get = vi.fn();
vi.mock("@app/services/apiClient", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
}));
vi.mock("@app/hooks/walletDevPreview", () => ({
  getWalletDevPreview: () => null,
}));
vi.mock("@app/services/billing", () => ({ createPortalSession: vi.fn() }));
vi.mock("@app/platform/openExternal", () => ({ openExternal: vi.fn() }));

const { useWallet } = await import("@app/hooks/useWallet");
const { createAppQueryClient } = await import("@app/query/queryClient");

/** The hook reads through the shared cache, so it needs the app's own client. */
function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(createAppQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Full enough for the hook's deep-compare, which reads every field. */
function walletWith(freeRemaining: number) {
  return {
    data: {
      teamId: 1,
      status: "free",
      role: "leader",
      billingPeriodStart: "2026-08-01",
      billingPeriodEnd: "2026-08-31",
      billableUsed: 500 - freeRemaining,
      billableLimit: 500,
      freeAllowance: 500,
      freeRemaining,
      pricePerDocMinor: 2,
      bundleRatePerCreditMinor: null,
      currency: "usd",
      estimatedBillMinor: 0,
      capUsd: null,
      noCap: false,
      stripeSubscriptionId: null,
      spendUnitsThisPeriod: 0,
      docsProcessedThisPeriod: 0,
      uniquePdfsThisPeriod: 0,
      sizeMultiplierPdfsThisPeriod: 0,
      billingMode: "metered",
      prepaidUnitsRemaining: 0,
      prepaidUnitsTotal: 0,
      prepaidExpiresAt: null,
      recent: [],
      members: [],
      categoryBreakdown: { api: 0, ai: 0, automation: 0 },
      categoryDocs: { api: 0, ai: 0, automation: 0 },
    },
  };
}

describe("useWallet — keeping the figures fresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockReset();
    get.mockResolvedValue(walletWith(500));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("re-reads the wallet on the poll interval", async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(result.current.wallet).not.toBeNull());
    expect(get).toHaveBeenCalledTimes(1);

    get.mockResolvedValue(walletWith(480));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(result.current.wallet?.freeRemaining).toBe(480));
  });

  it("polls silently, so consumers gating on loading/error don't flicker", async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(result.current.wallet).not.toBeNull());

    // A poll that fails must leave the last good snapshot, and must not raise
    // `error` — Plan swaps a working page for an alert on that.
    get.mockRejectedValue(new Error("network blip"));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.wallet?.freeRemaining).toBe(500);
  });

  it("settles loading when a poll arrives over an in-flight visible load", async () => {
    // `loading` staying true would permanently suppress the limit modals, which
    // do `if (loading || !wallet) return null`. A poll landing on top of the
    // mount read is the case that used to risk it.
    let landMount: (v: unknown) => void = () => {};
    get.mockReturnValueOnce(
      new Promise((resolve) => {
        landMount = resolve;
      }),
    );
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.loading).toBe(true);

    get.mockResolvedValue(walletWith(470));
    await act(async () => {
      setTabHidden(false);
    });
    await act(async () => {
      landMount(walletWith(500));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.wallet).not.toBeNull();
    resetTabVisibility();
  });

  it("clears a stale error once a silent poll succeeds", async () => {
    // The visible mount load failing is meant to be logged; only the silent
    // retries stay quiet.
    expectConsole.warn(/\[useWallet\] fetch failed/);
    get.mockRejectedValueOnce(new Error("network blip"));
    const { result } = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    get.mockResolvedValue(walletWith(500));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.wallet?.freeRemaining).toBe(500);
  });

  it("stops polling while the tab is hidden and re-reads on return", async () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    await waitFor(() => expect(result.current.wallet).not.toBeNull());
    const afterMount = get.mock.calls.length;

    await act(async () => {
      setTabHidden(true);
      vi.advanceTimersByTime(120_000);
    });
    expect(get).toHaveBeenCalledTimes(afterMount);

    await act(async () => {
      setTabHidden(false);
    });
    await waitFor(() => expect(get.mock.calls.length).toBe(afterMount + 1));
    resetTabVisibility();
  });

  it("stops a disabled reader and discards its in-flight wallet response", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useWallet(enabled),
      { initialProps: { enabled: false }, wrapper },
    );
    expect(get).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.wallet).not.toBeNull());

    let finishPoll: (value: ReturnType<typeof walletWith>) => void = () => {};
    get.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPoll = resolve;
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(get).toHaveBeenCalledTimes(2);

    rerender({ enabled: false });
    await act(async () => {
      finishPoll(walletWith(480));
      vi.advanceTimersByTime(90_000);
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.wallet).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
