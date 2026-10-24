import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  loadStripe: vi.fn(),
  trackFailed: vi.fn(),
  trackRetrySucceeded: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({ loadStripe: mocks.loadStripe }));
vi.mock("@editor/services/analytics", () => ({
  trackStripeJsLoadFailed: mocks.trackFailed,
  trackStripeJsRetrySucceeded: mocks.trackRetrySucceeded,
}));

const fakeStripe = { createEmbeddedCheckoutPage: vi.fn() };

async function loadHookModule() {
  vi.resetModules();
  return import("@editor/hooks/useStripeJs");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadStripeJs", () => {
  it("reuses one load once it succeeds", async () => {
    mocks.loadStripe.mockResolvedValue(fakeStripe);
    const { loadStripeJs } = await loadHookModule();
    await expect(loadStripeJs("pk_test")).resolves.toBe(fakeStripe);
    await expect(loadStripeJs("pk_test")).resolves.toBe(fakeStripe);
    expect(mocks.loadStripe).toHaveBeenCalledTimes(1);
  });

  it("loads again after a failure instead of replaying it", async () => {
    mocks.loadStripe
      .mockRejectedValueOnce(new Error("Failed to load Stripe.js"))
      .mockResolvedValueOnce(fakeStripe);
    const { loadStripeJs } = await loadHookModule();
    await expect(loadStripeJs("pk_test")).rejects.toThrow(
      "Failed to load Stripe.js",
    );
    await expect(loadStripeJs("pk_test")).resolves.toBe(fakeStripe);
    expect(mocks.loadStripe).toHaveBeenCalledTimes(2);
  });
});

describe("useStripeJs", () => {
  it("reports a failed load and recovers on retry", async () => {
    mocks.loadStripe
      .mockRejectedValueOnce(new Error("Failed to load Stripe.js"))
      .mockResolvedValueOnce(fakeStripe);
    const { useStripeJs } = await loadHookModule();
    const { result } = renderHook(() => useStripeJs("pk_test", "test"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.stripe).toBeNull();
    expect(mocks.trackFailed).toHaveBeenCalledWith("test", 0);

    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);

    await waitFor(() => expect(result.current.stripe).toBe(fakeStripe));
    expect(mocks.trackRetrySucceeded).toHaveBeenCalledWith("test", 1);
  });

  it("skips the load without a publishable key", async () => {
    const { useStripeJs } = await loadHookModule();
    const { result } = renderHook(() => useStripeJs(null, "test"));
    expect(result.current).toMatchObject({ stripe: null, failed: false });
    expect(mocks.loadStripe).not.toHaveBeenCalled();
  });

  it("does not report a retry success for the first load", async () => {
    mocks.loadStripe.mockResolvedValue(fakeStripe);
    const { useStripeJs } = await loadHookModule();
    const { result } = renderHook(() => useStripeJs("pk_test", "test"));
    await waitFor(() => expect(result.current.stripe).toBe(fakeStripe));
    expect(mocks.trackRetrySucceeded).not.toHaveBeenCalled();
  });
});
