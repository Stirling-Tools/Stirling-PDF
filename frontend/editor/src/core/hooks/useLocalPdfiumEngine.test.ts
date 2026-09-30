import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockCreatePdfiumEngine = vi.fn();

vi.mock("@embedpdf/engines/pdfium-worker-engine", () => ({
  createPdfiumEngine: (...args: unknown[]) => mockCreatePdfiumEngine(...args),
}));

const mockStartEagerWasmCompilation = vi.fn();
let mockPdfiumWasmModulePromise: Promise<WebAssembly.Module | null>;

vi.mock("@app/services/wasmPrecompiler", () => ({
  get pdfiumWasmModulePromise() {
    return mockPdfiumWasmModulePromise;
  },
  startEagerWasmCompilation: () => mockStartEagerWasmCompilation(),
}));

describe("useLocalPdfiumEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("hands precompiled wasmModule to createPdfiumEngine", async () => {
    const fakeModule = {} as WebAssembly.Module;
    mockPdfiumWasmModulePromise = Promise.resolve(fakeModule);
    const fakeEngine = {
      closeAllDocuments: vi.fn(),
      destroy: vi.fn(),
    };
    mockCreatePdfiumEngine.mockReturnValue(fakeEngine);

    const { useLocalPdfiumEngine } =
      await import("@app/hooks/useLocalPdfiumEngine");

    const { result } = renderHook(() =>
      useLocalPdfiumEngine({ wasmUrl: "https://example.com/pdfium.wasm" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockStartEagerWasmCompilation).toHaveBeenCalledTimes(1);
    expect(mockCreatePdfiumEngine).toHaveBeenCalledWith(
      "https://example.com/pdfium.wasm",
      expect.objectContaining({
        wasmModule: fakeModule,
      }),
    );
    expect(result.current.engine).toBe(fakeEngine);
  });

  test("falls back without wasmModule when precompile resolves null", async () => {
    mockPdfiumWasmModulePromise = Promise.resolve(null);
    const fakeEngine = {
      closeAllDocuments: vi.fn(),
      destroy: vi.fn(),
    };
    mockCreatePdfiumEngine.mockReturnValue(fakeEngine);

    const { useLocalPdfiumEngine } =
      await import("@app/hooks/useLocalPdfiumEngine");

    const { result } = renderHook(() =>
      useLocalPdfiumEngine({ wasmUrl: "https://example.com/pdfium.wasm" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockCreatePdfiumEngine).toHaveBeenCalledWith(
      "https://example.com/pdfium.wasm",
      expect.not.objectContaining({
        wasmModule: expect.anything(),
      }),
    );
    expect(result.current.engine).toBe(fakeEngine);
  });
});
