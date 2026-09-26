import { describe, expect, test, vi, afterEach } from "vitest";
import { allowConsole } from "@app/tests/failOnConsole";

/**
 * Contract for the eager pdfium wasm bootstrap: it must start at most once,
 * fall back when compileStreaming is unavailable/failing, and must not inject
 * a <link rel="preload"> (WebKit does not reuse it for compileStreaming and
 * downloaded the 4.6 MB binary twice).
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

  test("falls back to ArrayBuffer compile and runs once", async () => {
    allowConsole.warn(/compileStreaming failed/);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const compileSpy = vi
      .spyOn(WebAssembly, "compile")
      .mockResolvedValue({} as WebAssembly.Module);
    vi.spyOn(WebAssembly, "compileStreaming").mockRejectedValue(
      new Error("no streaming"),
    );

    const { startEagerWasmCompilation, pdfiumWasmModulePromise } =
      await loadFresh();
    startEagerWasmCompilation();
    startEagerWasmCompilation();

    await expect(pdfiumWasmModulePromise).resolves.toMatchObject({
      module: expect.anything(),
    });
    expect(compileSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // streaming attempt + fallback fetch
  });

  test("resolves null when compilation fails instead of throwing", async () => {
    allowConsole.warn(/compileStreaming failed/);
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
