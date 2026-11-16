// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PdfAccessRequest } from "@editor/workers/pdfAccessWorker";

const init = vi.hoisted(() => vi.fn());
vi.mock("@embedpdf/pdfium", () => ({ init }));
vi.mock("@editor/utils/pdfiumAccess", () => ({
  readPdfiumAccess: () => ({ encrypted: false }),
}));

const scope = {
  onmessage: undefined as
    | ((event: { data: PdfAccessRequest }) => Promise<void>)
    | undefined,
  postMessage: vi.fn(),
};
const ready = {
  PDFiumExt_Init: vi.fn(),
  FPDF_LoadMemDocument: vi.fn(() => 1),
  FPDF_CloseDocument: vi.fn(),
  pdfium: {
    HEAPU8: new Uint8Array(128),
    wasmExports: { malloc: () => 1, free: vi.fn() },
  },
};
const request: PdfAccessRequest = {
  file: new Blob(["PDF"]),
  password: "",
  wasmUrl: "/pdfium.wasm",
  wasmModule: new WebAssembly.Module(
    new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
  ),
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("self", scope);
  vi.stubGlobal("fetch", vi.fn());
  await import("@editor/workers/pdfAccessWorker");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("instantiates the shared module without fetching WASM again", async () => {
  init.mockImplementation(
    ({ instantiateWasm }) =>
      new Promise((resolve) => {
        instantiateWasm({}, () => resolve(ready));
      }),
  );
  await scope.onmessage!({ data: request });
  expect(fetch).not.toHaveBeenCalled();
  expect(scope.postMessage).toHaveBeenCalledWith({
    access: { encrypted: false },
  });
  expect(ready.pdfium.wasmExports.free).toHaveBeenCalledWith(1);
});

it("reports a compiled module initialization failure instead of hanging", async () => {
  vi.spyOn(WebAssembly, "instantiate").mockRejectedValue(
    new Error("Import mismatch"),
  );
  init.mockImplementation(
    ({ instantiateWasm }) =>
      new Promise((resolve) => {
        instantiateWasm({}, () => resolve(ready));
      }),
  );
  await scope.onmessage!({ data: request });
  expect(scope.postMessage).toHaveBeenCalledWith({
    error: "Unable to inspect PDF security locally",
  });
  expect(ready.FPDF_LoadMemDocument).not.toHaveBeenCalled();
});

it("falls back to the WASM asset when compilation is unavailable", async () => {
  const bytes = new ArrayBuffer(8);
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    arrayBuffer: async () => bytes,
  } as Response);
  init.mockResolvedValue(ready);
  await scope.onmessage!({ data: { ...request, wasmModule: null } });
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/pdfium.wasm");
  expect(init).toHaveBeenCalledExactlyOnceWith({ wasmBinary: bytes });
  expect(scope.postMessage).toHaveBeenCalledWith({
    access: { encrypted: false },
  });
});
