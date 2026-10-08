import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockCreatePdfiumEngine = vi.fn();

vi.mock("@embedpdf/engines/pdfium-worker-engine", () => ({
  createPdfiumEngine: (...args: unknown[]) => mockCreatePdfiumEngine(...args),
}));

const mockStartEagerWasmCompilation = vi.fn();

vi.mock("@app/services/wasmPrecompiler", () => ({
  startEagerWasmCompilation: () => mockStartEagerWasmCompilation(),
}));

const WASM_URL = "https://example.com/pdfium.wasm";

function engineWith(wait: (ok: () => void, fail: () => void) => void) {
  return {
    closeAllDocuments: () => ({ wait }),
    destroy: vi.fn(),
  };
}

describe("useLocalPdfiumEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates the worker engine from the wasm url without gating on the precompiled module", async () => {
    const engine = engineWith((ok) => ok());
    mockCreatePdfiumEngine.mockReturnValue(engine);

    const { useLocalPdfiumEngine } =
      await import("@app/hooks/useLocalPdfiumEngine");

    const { result } = renderHook(() =>
      useLocalPdfiumEngine({ wasmUrl: WASM_URL }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockStartEagerWasmCompilation).toHaveBeenCalledTimes(1);
    expect(mockCreatePdfiumEngine).toHaveBeenCalledWith(
      WASM_URL,
      expect.not.objectContaining({ wasmModule: expect.anything() }),
    );
    expect(result.current.engine).toBe(engine);
  });

  test("destroys the engine when its documents close successfully", async () => {
    const engine = engineWith((ok) => ok());
    mockCreatePdfiumEngine.mockReturnValue(engine);

    const { useLocalPdfiumEngine } =
      await import("@app/hooks/useLocalPdfiumEngine");

    const { unmount } = renderHook(() =>
      useLocalPdfiumEngine({ wasmUrl: WASM_URL }),
    );
    await waitFor(() => {
      expect(mockCreatePdfiumEngine).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });

  test("still destroys the engine when closing its documents fails", async () => {
    // The engine's `wait` runs only one of its two callbacks, so destroy has to
    // be registered on the failure path too or the worker leaks.
    const engine = engineWith((_ok, fail) => fail());
    mockCreatePdfiumEngine.mockReturnValue(engine);

    const { useLocalPdfiumEngine } =
      await import("@app/hooks/useLocalPdfiumEngine");

    const { unmount } = renderHook(() =>
      useLocalPdfiumEngine({ wasmUrl: WASM_URL }),
    );
    await waitFor(() => {
      expect(mockCreatePdfiumEngine).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });

  test("destroys the previous engine when the wasm url changes", async () => {
    const first = engineWith((ok) => ok());
    const second = engineWith((ok) => ok());
    mockCreatePdfiumEngine
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const { useLocalPdfiumEngine } =
      await import("@app/hooks/useLocalPdfiumEngine");

    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useLocalPdfiumEngine({ wasmUrl: url }),
      { initialProps: { url: WASM_URL } },
    );
    await waitFor(() => {
      expect(result.current.engine).toBe(first);
    });

    rerender({ url: "https://example.com/other.wasm" });

    await waitFor(() => {
      expect(result.current.engine).toBe(second);
    });
    expect(first.destroy).toHaveBeenCalledTimes(1);
  });

  test("clears a prior error once a later attempt succeeds", async () => {
    mockCreatePdfiumEngine.mockImplementationOnce(() => {
      throw new Error("engine failed");
    });
    const recovered = engineWith((ok) => ok());
    mockCreatePdfiumEngine.mockReturnValueOnce(recovered);

    const { useLocalPdfiumEngine } =
      await import("@app/hooks/useLocalPdfiumEngine");

    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useLocalPdfiumEngine({ wasmUrl: url }),
      { initialProps: { url: WASM_URL } },
    );
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    rerender({ url: "https://example.com/other.wasm" });

    await waitFor(() => {
      expect(result.current.engine).toBe(recovered);
    });
    expect(result.current.error).toBeNull();
  });
});
