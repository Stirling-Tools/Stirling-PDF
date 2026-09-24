/**
 * Shared engine lifecycle: the warm-up and the viewer hook must create one
 * engine between them, and the last unmount must destroy it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const engineMocks = vi.hoisted(() => {
  const created: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
  const createPdfiumEngine = vi.fn((..._args: unknown[]) => {
    const engine = {
      closeAllDocuments: vi.fn(() => ({ wait: (cb: () => void) => cb() })),
      destroy: vi.fn(),
    };
    created.push(engine);
    return engine;
  });
  return { created, createPdfiumEngine };
});

vi.mock("@embedpdf/engines/pdfium-worker-engine", () => ({
  createPdfiumEngine: (...args: unknown[]) =>
    engineMocks.createPdfiumEngine(...args),
}));

vi.mock("@app/services/wasmPrecompiler", () => ({
  pdfiumWasmModulePromise: Promise.resolve(null),
  startEagerWasmCompilation: vi.fn(),
}));

const options = {
  wasmUrl: "mem://pdfium-test.wasm",
  fontFallback: null,
};

async function loadModule() {
  vi.resetModules();
  return await import("@app/hooks/useLocalPdfiumEngine");
}

describe("useLocalPdfiumEngine", () => {
  beforeEach(() => {
    engineMocks.created.length = 0;
    engineMocks.createPdfiumEngine.mockClear();
  });

  it("shares one engine between the warm-up and the viewer", async () => {
    const { warmUpViewerEngine, useLocalPdfiumEngine } = await loadModule();

    const warmed = await warmUpViewerEngine(options);
    const { result } = renderHook(() => useLocalPdfiumEngine(options));
    await act(async () => {});

    expect(engineMocks.createPdfiumEngine).toHaveBeenCalledTimes(1);
    expect(result.current.engine).toBe(warmed);
    expect(result.current.isLoading).toBe(false);
  });

  it("joins an in-flight warm-up instead of creating a second engine", async () => {
    const { warmUpViewerEngine, useLocalPdfiumEngine } = await loadModule();

    const pending = warmUpViewerEngine(options);
    const { result } = renderHook(() => useLocalPdfiumEngine(options));
    await act(async () => {
      await pending;
    });

    expect(engineMocks.createPdfiumEngine).toHaveBeenCalledTimes(1);
    expect(result.current.engine).toBe(await pending);
  });

  it("destroys the engine when the last viewer unmounts and recreates later", async () => {
    const { warmUpViewerEngine, useLocalPdfiumEngine } = await loadModule();

    const { unmount } = renderHook(() => useLocalPdfiumEngine(options));
    await act(async () => {});
    expect(engineMocks.created).toHaveLength(1);

    unmount();
    expect(engineMocks.created[0].destroy).toHaveBeenCalledTimes(1);

    const fresh = await warmUpViewerEngine(options);
    expect(engineMocks.createPdfiumEngine).toHaveBeenCalledTimes(2);
    expect(fresh).not.toBe(engineMocks.created[0]);
  });

  it("keeps the engine while another viewer still holds it", async () => {
    const { useLocalPdfiumEngine } = await loadModule();

    const first = renderHook(() => useLocalPdfiumEngine(options));
    const second = renderHook(() => useLocalPdfiumEngine(options));
    await act(async () => {});
    expect(engineMocks.createPdfiumEngine).toHaveBeenCalledTimes(1);

    first.unmount();
    expect(engineMocks.created[0].destroy).not.toHaveBeenCalled();

    second.unmount();
    expect(engineMocks.created[0].destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed creation retryable", async () => {
    const { warmUpViewerEngine } = await loadModule();
    engineMocks.createPdfiumEngine.mockImplementationOnce(() => {
      throw new Error("no worker");
    });

    await expect(warmUpViewerEngine(options)).rejects.toThrow("no worker");

    const fresh = await warmUpViewerEngine(options);
    expect(engineMocks.createPdfiumEngine).toHaveBeenCalledTimes(2);
    expect(fresh).toBe(engineMocks.created[0]);
  });
});
