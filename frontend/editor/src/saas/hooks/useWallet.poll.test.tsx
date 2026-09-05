import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { expectConsole } from "@app/tests/failOnConsole";

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
  afterEach(() => vi.useRealTimers());

  it("re-reads the wallet on the poll interval", async () => {
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.wallet).not.toBeNull());
    expect(get).toHaveBeenCalledTimes(1);

    get.mockResolvedValue(walletWith(480));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(result.current.wallet?.freeRemaining).toBe(480));
  });

  it("polls silently, so consumers gating on loading/error don't flicker", async () => {
    const { result } = renderHook(() => useWallet());
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

  it("settles loading when a silent poll supersedes an in-flight visible load", async () => {
    // The mount load raises `loading`; a poll firing before it lands cancels it.
    // If clearing the flag were the silent load's to skip, both would decline
    // and `loading` would stay true forever — which permanently suppresses the
    // limit modals, since they do `if (loading || !wallet) return null`.
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");

    let landMount: (v: unknown) => void = () => {};
    get.mockReturnValueOnce(
      new Promise((resolve) => {
        landMount = resolve;
      }),
    );
    const { result } = renderHook(() => useWallet());
    expect(result.current.loading).toBe(true);

    get.mockResolvedValue(walletWith(470));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      landMount(walletWith(500));
    });

    await waitFor(() => expect(result.current.wallet?.freeRemaining).toBe(470));
    expect(result.current.loading).toBe(false);
    visibility.mockRestore();
  });

  it("clears a stale error once a silent poll succeeds", async () => {
    // The visible mount load failing is meant to be logged; only the silent
    // retries stay quiet.
    expectConsole.warn(/\[useWallet\] fetch failed/);
    get.mockRejectedValueOnce(new Error("network blip"));
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    get.mockResolvedValue(walletWith(500));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.wallet?.freeRemaining).toBe(500);
  });

  it("stops polling while the tab is hidden and re-reads on return", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    const { result } = renderHook(() => useWallet());
    await waitFor(() => expect(result.current.wallet).not.toBeNull());
    const afterMount = get.mock.calls.length;

    visibility.mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(120_000);
    });
    expect(get).toHaveBeenCalledTimes(afterMount);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(get.mock.calls.length).toBe(afterMount + 1));
    visibility.mockRestore();
  });
});
