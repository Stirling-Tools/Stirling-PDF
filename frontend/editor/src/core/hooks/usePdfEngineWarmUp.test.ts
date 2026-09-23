import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startEagerWasmCompilation = vi.hoisted(() => vi.fn());
vi.mock("@app/services/wasmPrecompiler", () => ({
  startEagerWasmCompilation,
}));
// A plain function, not vi.fn: a spy attaches its own handlers to the promise it
// returns, which would hide the unhandled rejection the last case looks for.
const pdfjsWarmUp = vi.hoisted(() => ({ calls: 0, fail: false }));
vi.mock("@app/services/pdfWorkerManager", () => ({
  loadPdfjs: () => {
    pdfjsWarmUp.calls++;
    return pdfjsWarmUp.fail
      ? Promise.reject(new Error("offline"))
      : Promise.resolve();
  },
}));

import { usePdfEngineWarmUp } from "@app/hooks/usePdfEngineWarmUp";

/** Idle work the hook queued, run by hand: when the browser goes idle is not the contract. */
const queued = new Map<number, IdleRequestCallback>();
const runIdleWork = () => {
  for (const callback of queued.values())
    callback({ didTimeout: false, timeRemaining: () => 50 });
  queued.clear();
};

describe("usePdfEngineWarmUp", () => {
  beforeEach(() => {
    startEagerWasmCompilation.mockClear();
    pdfjsWarmUp.calls = 0;
    pdfjsWarmUp.fail = false;
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

  it("starts both downloads once the shell is idle, not during its render", () => {
    renderHook(() => usePdfEngineWarmUp());
    expect(startEagerWasmCompilation).not.toHaveBeenCalled();
    expect(pdfjsWarmUp.calls).toBe(0);

    runIdleWork();
    expect(startEagerWasmCompilation).toHaveBeenCalledTimes(1);
    expect(pdfjsWarmUp.calls).toBe(1);
  });

  it("does not start them for a shell that unmounted first", () => {
    const { unmount } = renderHook(() => usePdfEngineWarmUp());
    unmount();

    runIdleWork();
    expect(startEagerWasmCompilation).not.toHaveBeenCalled();
    expect(pdfjsWarmUp.calls).toBe(0);
  });

  it("swallows a failed pdf.js warm-up, which the first real use retries", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    pdfjsWarmUp.fail = true;
    try {
      renderHook(() => usePdfEngineWarmUp());
      runIdleWork();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
