/**
 * Shared main-thread document lifecycle (openRawDocument / closeDocAndFreeBuffer /
 * releaseSharedDocument / resetPdfiumModule), exercised against a fake
 * @embedpdf/pdfium module so the pointer state machine is covered without WASM.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const pdfium = vi.hoisted(() => {
  const state = {
    module: null as Record<string, unknown> | null,
    closeCalls: [] as number[],
    freeCalls: [] as number[],
    allocationOrder: [] as string[],
    nextDocPtr: 1000,
    nextDataPtr: 5000,
  };
  const makeModule = () => {
    const heap = new Uint8Array(1 << 20);
    state.closeCalls = [];
    state.freeCalls = [];
    state.allocationOrder = [];
    const module = {
      PDFiumExt_Init: vi.fn(),
      FPDF_LoadMemDocument: vi.fn(() => ++state.nextDocPtr),
      FPDF_CloseDocument: vi.fn((p: number) => state.closeCalls.push(p)),
      FPDF_GetLastError: vi.fn(() => 0),
      pdfium: {
        wasmExports: {
          malloc: vi.fn(() => {
            state.allocationOrder.push("malloc");
            return (state.nextDataPtr += 1 << 16);
          }),
          free: vi.fn((p: number) => {
            state.allocationOrder.push("free");
            state.freeCalls.push(p);
          }),
        },
        HEAPU8: heap,
      },
    };
    state.module = module;
    return module;
  };
  makeModule();
  return { state, makeModule };
});

vi.mock("@embedpdf/pdfium", () => ({
  init: vi.fn(async () => pdfium.makeModule()),
}));

vi.mock("@app/services/wasmPrecompiler", () => ({
  pdfiumWasmModulePromise: Promise.resolve(null),
  startEagerWasmCompilation: vi.fn(),
  pdfiumWasmUrl: "mem://pdfium-test.wasm",
}));

import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
  releaseSharedDocument,
  releaseSharedDocumentWhenIdle,
  resetPdfiumModule,
} from "@app/services/pdfiumService";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";

const closeCalls = () => pdfium.state.closeCalls;
const freeCalls = () => pdfium.state.freeCalls;

describe("shared document lifecycle", () => {
  beforeEach(async () => {
    pdfium.makeModule();
    resetPdfiumModule();
    await getPdfiumModule();
  });

  afterEach(() => {
    resetPdfiumModule();
  });

  it("shares one open across readers; the handle lingers at zero refs until release", async () => {
    const data = new ArrayBuffer(16);
    const doc1 = await openRawDocumentSafe(data);
    const doc2 = await openRawDocumentSafe(data);
    expect(doc2).toBe(doc1);

    const m = await getPdfiumModule();
    closeDocAndFreeBuffer(m, doc2);
    closeDocAndFreeBuffer(m, doc1);
    expect(closeCalls()).toEqual([]);

    releaseSharedDocument();
    expect(closeCalls()).toEqual([doc1]);
    expect(freeCalls().length).toBe(1);
  });

  it("release with an active reader defers the close to the last reader", async () => {
    const data = new ArrayBuffer(16);
    const doc = await openRawDocumentSafe(data);
    await openRawDocumentSafe(data);

    releaseSharedDocument();
    expect(closeCalls()).toEqual([]);

    const m = await getPdfiumModule();
    closeDocAndFreeBuffer(m, doc);
    expect(closeCalls()).toEqual([]);

    closeDocAndFreeBuffer(m, doc);
    expect(closeCalls()).toEqual([doc]);
  });

  it("release with no readers closes immediately", async () => {
    const data = new ArrayBuffer(16);
    const doc = await openRawDocumentSafe(data);
    const m = await getPdfiumModule();
    closeDocAndFreeBuffer(m, doc);
    expect(closeCalls()).toEqual([]);

    releaseSharedDocument();
    expect(closeCalls()).toEqual([doc]);
  });

  it("a stale close on a lingering zero-ref handle does not double-close", async () => {
    const data = new ArrayBuffer(16);
    const doc = await openRawDocumentSafe(data);
    const m = await getPdfiumModule();
    closeDocAndFreeBuffer(m, doc);
    expect(closeCalls()).toEqual([]);

    closeDocAndFreeBuffer(m, doc);
    expect(closeCalls()).toEqual([]);
    expect(freeCalls().length).toBe(0);

    // The lingering handle still serves the next same-bytes open.
    const doc2 = await openRawDocumentSafe(data);
    expect(doc2).toBe(doc);
  });

  it("reset with an active reader drops the handle and the reader's close closes once", async () => {
    const data = new ArrayBuffer(16);
    const doc = await openRawDocumentSafe(data);

    resetPdfiumModule();
    expect(closeCalls()).toEqual([]);

    closeDocAndFreeBuffer(await getPdfiumModule(), doc);
    expect(closeCalls()).toEqual([doc]);
    // The reader re-fetches the module after the reset, so the close must
    // still free the buffer in the heap that allocated it.
    expect(freeCalls()).toHaveLength(1);
  });

  it("closes an idle shared handle before allocating its replacement", async () => {
    const dataA = new ArrayBuffer(16);
    const dataB = new ArrayBuffer(24);
    const docA = await openRawDocumentSafe(dataA);
    closeDocAndFreeBuffer(await getPdfiumModule(), docA);
    pdfium.state.allocationOrder = [];

    await openRawDocumentSafe(dataB);

    // A's buffer is freed before B's allocation, so the two never coexist.
    expect(pdfium.state.allocationOrder).toEqual(["free", "malloc"]);
  });

  it("queues the release behind a scan so a late open cannot linger", async () => {
    const data = new ArrayBuffer(16);
    const scan = runPdfiumScan(async () => {
      const doc = await openRawDocumentSafe(data);
      await Promise.resolve();
      closeDocAndFreeBuffer(await getPdfiumModule(), doc);
    });
    // The file left the workbench while the scan was queued.
    releaseSharedDocumentWhenIdle();
    await scan;
    await runPdfiumScan(async () => undefined);

    expect(closeCalls()).toHaveLength(1);
  });

  it("open with different bytes closes a zero-ref shared handle and clears a pending release", async () => {
    const dataA = new ArrayBuffer(16);
    const dataB = new ArrayBuffer(24);
    const docA = await openRawDocumentSafe(dataA);
    const m = await getPdfiumModule();
    closeDocAndFreeBuffer(m, docA);

    await openRawDocumentSafe(dataB);
    expect(closeCalls()).toEqual([docA]);

    await openRawDocumentSafe(dataA);
    expect(closeCalls()).toEqual([docA]);
  });
});
