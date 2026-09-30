import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAnimationFrameCallback } from "@app/hooks/useAnimationFrameCallback";

/** Runs every frame callback queued so far, as the browser would before paint. */
function flushFrames() {
  vi.runAllTimers();
}

describe("useAnimationFrameCallback", () => {
  it("collapses a burst of scroll events into one run", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useAnimationFrameCallback(callback));

    // A scroll gesture fires far more events than there are frames.
    for (let i = 0; i < 50; i++) result.current();
    flushFrames();

    expect(callback).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("keeps running on later frames so the position keeps tracking", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useAnimationFrameCallback(callback));

    result.current();
    flushFrames();
    result.current();
    flushFrames();

    expect(callback).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("always runs the latest callback without rescheduling", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useAnimationFrameCallback(cb),
      { initialProps: { cb: first } },
    );

    result.current();
    rerender({ cb: second });
    flushFrames();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("cancels a pending frame on unmount", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAnimationFrameCallback(callback),
    );

    result.current();
    unmount();
    flushFrames();

    expect(callback).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
