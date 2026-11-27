// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { saveRewritten } from "@editor/tools/pdfTextEditor/util/pdfiumCopy";

function fakeModule(mallocResult: number) {
  const heap = new Uint8Array(64);
  heap.set([1, 2, 3, 4], 0);
  const getData = vi.fn();
  const closeWriter = vi.fn();
  const module = {
    PDFiumExt_OpenFileWriter: () => 7,
    PDFiumExt_CloseFileWriter: closeWriter,
    FPDF_SaveAsCopy: () => true,
    PDFiumExt_GetFileWriterSize: () => 4,
    PDFiumExt_GetFileWriterData: getData,
    pdfium: {
      HEAPU8: heap,
      wasmExports: { malloc: () => mallocResult, free: vi.fn() },
    },
  } as unknown as WrappedPdfiumModule;
  return { module, getData, closeWriter };
}

test("a save whose output buffer cannot be allocated fails instead of returning low memory", () => {
  const { module, getData, closeWriter } = fakeModule(0);
  expect(() => saveRewritten(module, 42)).toThrow(/allocate/);
  expect(getData).not.toHaveBeenCalled();
  expect(closeWriter).toHaveBeenCalledWith(7);
});

test("a save with room for its output returns the written bytes", () => {
  const { module, closeWriter } = fakeModule(16);
  expect(saveRewritten(module, 42)).toHaveLength(4);
  expect(closeWriter).toHaveBeenCalledWith(7);
});
