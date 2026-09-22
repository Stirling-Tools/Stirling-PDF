import { describe, it, expect, vi, afterEach } from "vitest";
import { yieldToMain } from "@app/utils/taskYield";

describe("yieldToMain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls scheduler.yield when available on globalThis", async () => {
    const yieldFn = vi.fn().mockResolvedValue(undefined);
    const originalScheduler = (globalThis as unknown as { scheduler?: unknown })
      .scheduler;
    (globalThis as unknown as { scheduler?: unknown }).scheduler = {
      yield: yieldFn,
    };

    try {
      await yieldToMain();
      expect(yieldFn).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as unknown as { scheduler?: unknown }).scheduler =
        originalScheduler;
    }
  });

  it("falls back to setTimeout when scheduler is unavailable", async () => {
    const originalScheduler = (globalThis as unknown as { scheduler?: unknown })
      .scheduler;
    delete (globalThis as unknown as { scheduler?: unknown }).scheduler;

    try {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      await yieldToMain();
      expect(setTimeoutSpy).toHaveBeenCalled();
    } finally {
      (globalThis as unknown as { scheduler?: unknown }).scheduler =
        originalScheduler;
    }
  });
});
