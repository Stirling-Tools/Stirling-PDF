import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const warmUpViewerEngineMock = vi.fn((_options?: unknown) =>
  Promise.resolve({}),
);

vi.mock("@app/hooks/useLocalPdfiumEngine", () => ({
  warmUpViewerEngine: (options: unknown) => warmUpViewerEngineMock(options),
}));

vi.mock("@app/services/pdfiumFontFallback", () => ({
  getLocalFontFallbackConfig: () => null,
}));

vi.mock("@app/services/wasmPrecompiler", () => ({
  pdfiumWasmUrl: "mock://wasm",
}));

import { useViewerEngineWarmUp } from "./useViewerEngineWarmUp";

describe("useViewerEngineWarmUp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    warmUpViewerEngineMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers warm-up after idle timeout", () => {
    renderHook(() => useViewerEngineWarmUp());
    expect(warmUpViewerEngineMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(warmUpViewerEngineMock).toHaveBeenCalledTimes(1);
  });

  it("triggers early on pointerdown", () => {
    renderHook(() => useViewerEngineWarmUp());
    expect(warmUpViewerEngineMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pointerdown"));
    expect(warmUpViewerEngineMock).toHaveBeenCalledTimes(1);

    // Ensure timer expiration afterwards does not trigger a second time
    vi.advanceTimersByTime(1000);
    expect(warmUpViewerEngineMock).toHaveBeenCalledTimes(1);
  });

  it("cancels scheduled warm-up on unmount", () => {
    const { unmount } = renderHook(() => useViewerEngineWarmUp());
    unmount();

    vi.advanceTimersByTime(1000);
    expect(warmUpViewerEngineMock).not.toHaveBeenCalled();
  });
});
