import { describe, expect, test, vi, afterEach } from "vitest";
import { allowConsole } from "@app/tests/failOnConsole";

/**
 * Contract for the eager pdfium wasm bootstrap: it starts at most once, fetches
 * the binary and compiles the buffer, resolves null on failure instead of
 * throwing, and never injects a <link rel="preload"> (WebKit downloaded the
 * 4.6 MB binary twice when it did).
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function loadFresh() {
  vi.resetModules();
  return await import("@app/services/wasmPrecompiler");
}

describe("wasmPrecompiler", () => {
  test("does not inject a wasm preload link", async () => {
    const { pdfiumWasmUrl } = await loadFresh();
    const link = document.head.querySelector(`link[href="${pdfiumWasmUrl}"]`);
    expect(link).toBeNull();
  });

  test("fetches the wasm and compiles the buffer once", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const compileSpy = vi.spyOn(WebAssembly, "compile").mockResolvedValue({});
    const streamingSpy = vi.spyOn(WebAssembly, "compileStreaming");

    const { startEagerWasmCompilation, pdfiumWasmModulePromise } =
      await loadFresh();
    startEagerWasmCompilation();
    startEagerWasmCompilation();

    await expect(pdfiumWasmModulePromise).resolves.toMatchObject({
      module: expect.anything(),
    });
    expect(compileSpy).toHaveBeenCalledTimes(1);
    expect(streamingSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("resolves null when compilation fails instead of throwing", async () => {
    allowConsole.warn(/WASM compilation failed/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const { startEagerWasmCompilation, pdfiumWasmModulePromise } =
      await loadFresh();
    startEagerWasmCompilation();
    await expect(pdfiumWasmModulePromise).resolves.toBeNull();
  });
});
