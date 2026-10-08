/**
 * `getPageLabels` reads the `/PageLabels` number tree through the same fake
 * @embedpdf/pdfium module as the shared-document test: only the two FPDF calls
 * that differ from lifecycle plumbing are stubbed, so the per-page length probe,
 * UTF-16 decode and buffer release are exercised without WASM.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const pdfium = vi.hoisted(() => {
  const state = {
    labels: [] as Array<string | null>,
    freeCalls: [] as number[],
    heap: new Uint8Array(1 << 20),
    nextDocPtr: 1000,
    nextDataPtr: 5000,
  };
  const writeUtf16 = (ptr: number, text: string) => {
    const encoded = new Uint8Array((text.length + 1) * 2);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      encoded[i * 2] = code & 0xff;
      encoded[i * 2 + 1] = code >> 8;
    }
    state.heap.set(encoded, ptr);
    return encoded.length;
  };
  const makeModule = () => {
    state.freeCalls = [];
    return {
      PDFiumExt_Init: vi.fn(),
      FPDF_LoadMemDocument: vi.fn(() => ++state.nextDocPtr),
      FPDF_CloseDocument: vi.fn(),
      FPDF_GetLastError: vi.fn(() => 0),
      FPDF_GetPageCount: vi.fn(() => state.labels.length),
      // Two-call contract: empty request (buffer 0) reports the byte length
      // including the NUL pair; a real buffer receives the UTF-16LE text.
      FPDF_GetPageLabel: vi.fn(
        (_doc: number, index: number, buffer: number, _len: number) => {
          const text = state.labels[index];
          if (text == null) return 0;
          if (!buffer) return (text.length + 1) * 2;
          return writeUtf16(buffer, text);
        },
      ),
      pdfium: {
        wasmExports: {
          malloc: vi.fn(() => (state.nextDataPtr += 1 << 16)),
          free: vi.fn((p: number) => state.freeCalls.push(p)),
        },
        UTF16ToString: vi.fn((ptr: number) => {
          let end = ptr;
          while (state.heap[end] !== 0 || state.heap[end + 1] !== 0) end += 2;
          const slice = state.heap.subarray(ptr, end);
          return new TextDecoder("utf-16le").decode(slice);
        }),
        HEAPU8: state.heap,
      },
    };
  };
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

import { getPageLabels, resetPdfiumModule } from "@app/services/pdfiumService";

describe("getPageLabels", () => {
  beforeEach(() => {
    pdfium.makeModule();
    resetPdfiumModule();
  });

  afterEach(() => {
    resetPdfiumModule();
  });

  it("decodes the label for every page, keeping unlabelled pages empty", async () => {
    pdfium.state.labels = ["i", "ii", "iii", "1", null];
    const labels = await getPageLabels(new ArrayBuffer(16));
    expect(labels).toEqual(["i", "ii", "iii", "1", ""]);
  });

  it("returns null when the document defines no page labels", async () => {
    pdfium.state.labels = [null, null, null];
    expect(await getPageLabels(new ArrayBuffer(16))).toBeNull();
  });

  it("frees every allocated label buffer", async () => {
    pdfium.state.labels = ["1", "2", "3"];
    await getPageLabels(new ArrayBuffer(16));
    expect(pdfium.state.freeCalls).toHaveLength(3);
  });
});
