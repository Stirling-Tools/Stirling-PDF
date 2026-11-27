import { afterEach, describe, expect, it, vi } from "vitest";

const pdfium = vi.hoisted(() => ({
  aborts: [] as ((what: unknown) => void)[],
}));

vi.mock("@embedpdf/pdfium", () => ({
  init: vi.fn(async (overrides: { onAbort?: (what: unknown) => void }) => {
    if (overrides.onAbort) pdfium.aborts.push(overrides.onAbort);
    return { PDFiumExt_Init: vi.fn(), pdfium: {} };
  }),
}));

vi.mock("@editor/services/wasmPrecompiler", () => ({
  pdfiumWasmModulePromise: Promise.resolve(null),
  startEagerWasmCompilation: vi.fn(),
  pdfiumWasmUrl: "mem://pdfium-test.wasm",
}));

import {
  getPdfiumModule,
  onPdfiumAbort,
  resetPdfiumModule,
} from "@editor/services/pdfiumService";

const abortModule = (index: number) => pdfium.aborts[index]("OOM");

describe("PDFium abort", () => {
  afterEach(() => {
    resetPdfiumModule();
    pdfium.aborts.length = 0;
  });

  it("replaces the shared module and tells listeners which one aborted", async () => {
    const aborted = await getPdfiumModule();
    const listener = vi.fn();
    const stop = onPdfiumAbort(listener);

    abortModule(0);

    expect(listener).toHaveBeenCalledExactlyOnceWith(aborted);
    const fresh = await getPdfiumModule();
    expect(fresh).not.toBe(aborted);
    stop();
  });

  it("reports a module once, however many of its calls abort", async () => {
    await getPdfiumModule();
    const listener = vi.fn();
    const stop = onPdfiumAbort(listener);

    abortModule(0);
    abortModule(0);

    expect(listener).toHaveBeenCalledOnce();
    stop();
  });

  it("leaves the current module alone when one already replaced aborts", async () => {
    await getPdfiumModule();
    resetPdfiumModule();
    const current = await getPdfiumModule();

    abortModule(0);

    expect(await getPdfiumModule()).toBe(current);
  });

  it("stops calling a listener once it unsubscribes", async () => {
    await getPdfiumModule();
    const listener = vi.fn();
    onPdfiumAbort(listener)();

    abortModule(0);

    expect(listener).not.toHaveBeenCalled();
  });
});
