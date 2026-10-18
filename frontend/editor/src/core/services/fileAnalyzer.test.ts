import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileAnalyzer } from "@app/services/fileAnalyzer";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { ensurePdfAccess } from "@app/services/pdfSessionUnlock";
import { clearPdfAccess } from "@app/services/pdfPasswordStore";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: { createDocument: vi.fn(), destroyDocument: vi.fn() },
}));
vi.mock("@app/services/pdfSessionUnlock", () => ({ ensurePdfAccess: vi.fn() }));

beforeEach(() => {
  clearPdfAccess();
  vi.clearAllMocks();
  vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(
    function (this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) resolve(reader.result);
          else reject(new Error("Expected PDF bytes"));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    },
  );
});

afterEach(() => vi.restoreAllMocks());

describe("large PDF encryption detection", () => {
  it.each([LARGE_PDF_PARSE_LIMIT, LARGE_PDF_PARSE_LIMIT * 10])(
    "detects encryption in a %i-byte PDF without parsing or uploading the whole file",
    async (size) => {
      const file = new File(["%PDF-1.7 /Encrypt 1 0 R"], "large.pdf");
      Object.defineProperty(file, "size", { value: size });
      const readAll = vi.spyOn(file, "arrayBuffer");
      const slices = vi.spyOn(file, "slice");

      expect(await FileAnalyzer.isPDFEncrypted(file)).toBe(true);
      expect(ensurePdfAccess).not.toHaveBeenCalled();
      expect(pdfWorkerManager.createDocument).not.toHaveBeenCalled();
      expect(readAll).not.toHaveBeenCalled();
      expect(slices).toHaveBeenCalledTimes(2);
    },
  );

  it("does not classify a large unmarked PDF as encrypted", async () => {
    const file = new File(["%PDF-1.7"], "large.pdf");
    Object.defineProperty(file, "size", { value: LARGE_PDF_PARSE_LIMIT });
    expect(await FileAnalyzer.isPDFEncrypted(file)).toBe(false);
    expect(ensurePdfAccess).not.toHaveBeenCalled();
    expect(pdfWorkerManager.createDocument).not.toHaveBeenCalled();
  });
});
