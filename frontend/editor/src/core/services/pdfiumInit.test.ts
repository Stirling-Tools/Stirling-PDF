import { describe, expect, test, vi } from "vitest";

/**
 * A WASM instantiate that fails must reject, not hang. `instantiateWasm` reports
 * success by callback, so a swallowed rejection leaves `init()` pending and takes
 * every thumbnail, page parse and form read with it - silently.
 */

const init = vi.hoisted(() => vi.fn());
vi.mock("@embedpdf/pdfium", () => ({ init }));

const wasmModule = vi.hoisted(() => ({}) as WebAssembly.Module);
vi.mock("@app/services/wasmPrecompiler", () => ({
  pdfiumWasmModulePromise: Promise.resolve(wasmModule),
  startEagerWasmCompilation: () => {},
  pdfiumWasmUrl: "http://localhost/pdfium.wasm",
}));

/** emscripten's contract: it calls instantiateWasm and waits to be called back. */
function emscriptenInit(
  instantiate: (imports: object, ok: () => void) => void,
) {
  return new Promise(() => {
    instantiate({}, () => {});
  });
}

async function loadService() {
  vi.resetModules();
  return await import("@app/services/pdfiumService");
}

describe("pdfium bootstrap", () => {
  test("rejects when instantiating the pre-compiled module fails", async () => {
    const failure = new Error("LinkError: import mismatch");
    vi.spyOn(WebAssembly, "instantiate").mockRejectedValue(failure as never);
    init.mockImplementation((overrides: Record<string, never>) =>
      emscriptenInit(
        overrides.instantiateWasm as unknown as (
          imports: object,
          ok: () => void,
        ) => void,
      ),
    );

    const { getPdfiumModule } = await loadService();

    // Before the fix this never settled, so the test timed out.
    await expect(getPdfiumModule()).rejects.toThrow(/LinkError/);
  });

  test("a failed load isn't cached, so the next call retries", async () => {
    const instantiate = vi
      .spyOn(WebAssembly, "instantiate")
      .mockRejectedValueOnce(new Error("transient") as never)
      .mockResolvedValue({} as never);
    const ready = { PDFiumExt_Init: () => {} };
    init.mockImplementation(
      (overrides: Record<string, never>) =>
        new Promise((resolve) => {
          const instantiateWasm = overrides.instantiateWasm as unknown as (
            imports: object,
            ok: () => void,
          ) => void;
          instantiateWasm({}, () => resolve(ready));
        }),
    );

    const { getPdfiumModule } = await loadService();

    await expect(getPdfiumModule()).rejects.toThrow(/transient/);
    await expect(getPdfiumModule()).resolves.toBe(ready);
    expect(instantiate).toHaveBeenCalledTimes(2);
  });
});
