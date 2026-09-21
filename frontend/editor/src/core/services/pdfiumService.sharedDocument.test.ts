/**
 * Shared main-thread document lifecycle (openRawDocument / closeDocAndFreeBuffer /
 * releaseSharedDocument / resetPdfiumModule), exercised against a fake
 * @embedpdf/pdfium module so the pointer state machine is covered without WASM.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const pdfium = vi.hoisted(() => {
  const state = {
    module: null as Record<string, unknown> | null,
    heap: new Uint8Array(1 << 20),
    closeCalls: [] as number[],
    freeCalls: [] as number[],
    removeCalls: [] as number[],
    lastGetBlock: null as
      | ((param: number, position: number, ptr: number, size: number) => number)
      | null,
    failOpen: false,
    withoutRuntimeHelpers: false,
    nextDocPtr: 1000,
    nextDataPtr: 5000,
  };
  const makeModule = (options: { withoutRuntimeHelpers?: boolean } = {}) => {
    const withoutRuntimeHelpers =
      options.withoutRuntimeHelpers ?? state.withoutRuntimeHelpers;
    const heap = new Uint8Array(1 << 20);
    state.heap = heap;
    state.closeCalls = [];
    state.freeCalls = [];
    state.removeCalls = [];
    state.lastGetBlock = null;
    state.failOpen = false;
    const module = {
      PDFiumExt_Init: vi.fn(),
      FPDF_LoadCustomDocument: vi.fn(() =>
        state.failOpen ? 0 : ++state.nextDocPtr,
      ),
      FPDF_LoadMemDocument: vi.fn(() => ++state.nextDocPtr),
      FPDF_CloseDocument: vi.fn((p: number) => state.closeCalls.push(p)),
      FPDF_GetLastError: vi.fn(() => 0),
      pdfium: {
        wasmExports: {
          malloc: vi.fn(() => (state.nextDataPtr += 1 << 16)),
          free: vi.fn((p: number) => state.freeCalls.push(p)),
        },
        HEAPU8: heap,
        removeFunction: vi.fn((p: number) => state.removeCalls.push(p)),
        setValue: vi.fn(),
        ...(withoutRuntimeHelpers
          ? {}
          : {
              addFunction: vi.fn(
                (
                  fn: (
                    param: number,
                    position: number,
                    ptr: number,
                    size: number,
                  ) => number,
                ) => {
                  state.lastGetBlock = fn;
                  return ++state.nextDataPtr;
                },
              ),
            }),
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
    pdfium.state.withoutRuntimeHelpers = false;
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

  it("copies requested blocks through the file-access callback", async () => {
    const data = new Uint8Array([1, 2, 3, 4]).buffer;
    await openRawDocumentSafe(data);
    const getBlock = pdfium.state.lastGetBlock;
    expect(getBlock).toBeTypeOf("function");

    expect(getBlock?.(0, 1, 100, 2)).toBe(1);
    expect(Array.from(pdfium.state.heap.slice(100, 102))).toEqual([2, 3]);
    // A range past the file must fail rather than copy garbage.
    expect(getBlock?.(0, 3, 100, 5)).toBe(0);
  });

  it("releases the access struct and the callback when the document closes", async () => {
    const doc = await openRawDocumentSafe(new Uint8Array([1, 2, 3, 4]).buffer);
    const m = await getPdfiumModule();
    closeDocAndFreeBuffer(m, doc);
    releaseSharedDocument();

    expect(pdfium.state.removeCalls).toHaveLength(1);
    expect(freeCalls().length).toBe(1);
  });

  it("releases the access struct and the callback when the open fails", async () => {
    pdfium.state.failOpen = true;
    await expect(
      openRawDocumentSafe(new Uint8Array([1, 2, 3, 4]).buffer),
    ).rejects.toThrow();
    pdfium.state.failOpen = false;

    expect(pdfium.state.removeCalls).toHaveLength(1);
    expect(freeCalls().length).toBe(1);
  });

  it("falls back to a heap copy without the function-table helpers", async () => {
    pdfium.state.withoutRuntimeHelpers = true;
    resetPdfiumModule();
    const m = await getPdfiumModule();
    const doc = await openRawDocumentSafe(new Uint8Array([1, 2, 3, 4]).buffer);

    expect(
      (pdfium.state.module as { FPDF_LoadMemDocument: unknown })
        .FPDF_LoadMemDocument,
    ).toHaveBeenCalled();
    closeDocAndFreeBuffer(m, doc);
    releaseSharedDocument();
    expect(freeCalls().length).toBe(1);
  });
});
