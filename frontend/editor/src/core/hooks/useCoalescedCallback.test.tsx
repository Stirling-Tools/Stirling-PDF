import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoalescedCallback } from "@app/hooks/useCoalescedCallback";

describe("useCoalescedCallback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs immediately on the first trigger", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    renderHook(
      ({ trigger }: { trigger: number }) =>
        useCoalescedCallback(callback, trigger, 100),
      { initialProps: { trigger: 0 } },
    );

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of triggers into one run per window", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    const { rerender } = renderHook(
      ({ trigger }: { trigger: number }) =>
        useCoalescedCallback(callback, trigger, 100),
      { initialProps: { trigger: 0 } },
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ trigger: 1 });
      rerender({ trigger: 2 });
      rerender({ trigger: 3 });
      vi.advanceTimersByTime(50);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending run on unmount", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    const { unmount } = renderHook(() =>
      useCoalescedCallback(callback, 0, 100),
    );
    unmount();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(callback).not.toHaveBeenCalled();
  });
});
