import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startEagerWasmCompilation = vi.hoisted(() => vi.fn());
vi.mock("@app/services/wasmPrecompiler", () => ({
  startEagerWasmCompilation,
}));

import { usePdfiumWarmUp } from "@app/hooks/usePdfiumWarmUp";

/** Idle work the hook queued, run by hand: when the browser goes idle is not the contract. */
const queued = new Map<number, IdleRequestCallback>();
const runIdleWork = () => {
  for (const callback of queued.values())
    callback({ didTimeout: false, timeRemaining: () => 50 });
  queued.clear();
};

describe("usePdfiumWarmUp", () => {
  beforeEach(() => {
    startEagerWasmCompilation.mockClear();
    queued.clear();
    let nextHandle = 1;
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      const handle = nextHandle++;
      queued.set(handle, callback);
      return handle;
    });
    vi.stubGlobal("cancelIdleCallback", (handle: number) => {
      queued.delete(handle);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts the download once the shell is idle, not during its render", () => {
    renderHook(() => usePdfiumWarmUp());
    expect(startEagerWasmCompilation).not.toHaveBeenCalled();

    runIdleWork();
    expect(startEagerWasmCompilation).toHaveBeenCalledTimes(1);
  });

  it("does not start it for a shell that unmounted first", () => {
    const { unmount } = renderHook(() => usePdfiumWarmUp());
    unmount();

    runIdleWork();
    expect(startEagerWasmCompilation).not.toHaveBeenCalled();
  });
});
