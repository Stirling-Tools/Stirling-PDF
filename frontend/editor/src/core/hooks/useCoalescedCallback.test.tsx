import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoalescedCallback } from "@app/hooks/useCoalescedCallback";
import { expectConsole } from "@app/tests/failOnConsole";

/** Never settles, standing in for a hung storage-server fetch. */
function pendingCallback() {
  return vi.fn(() => new Promise<void>(() => {}));
}

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

  it("does not run before the window elapses and runs at it", () => {
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
    });
    act(() => {
      vi.advanceTimersByTime(98);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("runs the next window while the previous callback is still pending", async () => {
    vi.useFakeTimers();
    const callback = pendingCallback();

    const { rerender } = renderHook(
      ({ trigger }: { trigger: number }) =>
        useCoalescedCallback(callback, trigger, 100),
      { initialProps: { trigger: 0 } },
    );
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ trigger: 1 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(2);

    act(() => {
      rerender({ trigger: 2 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("keeps to one run per window while a callback stays pending", async () => {
    vi.useFakeTimers();
    const callback = pendingCallback();

    const { rerender } = renderHook(
      ({ trigger }: { trigger: number }) =>
        useCoalescedCallback(callback, trigger, 100),
      { initialProps: { trigger: 0 } },
    );
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    for (let trigger = 1; trigger <= 10; trigger++) {
      act(() => {
        rerender({ trigger });
      });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    // Ten triggers spread over 500ms, so five elapsed windows plus the run
    // already in flight - no more, however long each run takes.
    expect(callback).toHaveBeenCalledTimes(6);
  });

  it("schedules a run when the callback changes and trigger does not", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ cb }: { cb: () => void | Promise<void> }) =>
        useCoalescedCallback(cb, 0, 100),
      { initialProps: { cb: first } },
    );
    act(() => {
      rerender({ cb: second });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("defers a pending run when the window widens", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    const { rerender } = renderHook(
      ({ trigger, windowMs }: { trigger: number; windowMs: number }) =>
        useCoalescedCallback(callback, trigger, windowMs),
      { initialProps: { trigger: 0, windowMs: 100 } },
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // A run is now pending, aimed at the 100ms deadline.
    act(() => {
      rerender({ trigger: 1, windowMs: 100 });
    });
    // Widening must move that pending deadline, not let it fire at 100.
    act(() => {
      rerender({ trigger: 1, windowMs: 500 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("brings a pending run forward when the window narrows", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    const { rerender } = renderHook(
      ({ trigger, windowMs }: { trigger: number; windowMs: number }) =>
        useCoalescedCallback(callback, trigger, windowMs),
      { initialProps: { trigger: 0, windowMs: 1000 } },
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // A run is now pending, aimed at the 1000ms deadline.
    act(() => {
      rerender({ trigger: 1, windowMs: 1000 });
    });
    act(() => {
      rerender({ trigger: 1, windowMs: 100 });
    });
    act(() => {
      vi.advanceTimersByTime(98);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(2);

    // The superseded 1000ms deadline must have been cancelled, not left armed.
    act(() => {
      vi.advanceTimersByTime(1000);
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

  it("lets an already-started callback schedule nothing after unmount", async () => {
    vi.useFakeTimers();
    let resolveFirst!: () => void;
    const callback = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { rerender, unmount } = renderHook(
      ({ trigger }: { trigger: number }) =>
        useCoalescedCallback(callback, trigger, 100),
      { initialProps: { trigger: 0 } },
    );
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ trigger: 1 });
    });
    unmount();
    await act(async () => {
      resolveFirst();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("leaves one initial run under StrictMode's double effect cycle", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    renderHook(
      ({ trigger }: { trigger: number }) =>
        useCoalescedCallback(callback, trigger, 100),
      { initialProps: { trigger: 0 }, wrapper: StrictMode },
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("logs a rejected callback and keeps serving later triggers", async () => {
    expectConsole.error("useCoalescedCallback");
    vi.useFakeTimers();
    const callback = vi.fn(() => Promise.reject(new Error("scan failed")));

    const { rerender } = renderHook(
      ({ trigger }: { trigger: number }) =>
        useCoalescedCallback(callback, trigger, 100),
      { initialProps: { trigger: 0 } },
    );
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ trigger: 1 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("catches a synchronous throw and keeps serving later triggers", () => {
    expectConsole.error("useCoalescedCallback");
    vi.useFakeTimers();
    const callback = vi.fn(() => {
      throw new Error("scan threw");
    });

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
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
