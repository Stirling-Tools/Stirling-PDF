// @vitest-environment node
import { describe, expect, test } from "vitest";
import { zipFileService } from "@editor/services/zipFileService";

// jsdom's Blob.slice(...).arrayBuffer() returns an empty buffer in this
// version, so a real Blob would never reach the magic-byte branch under test.
// Duck-type the parts isZipResponse actually touches.
function fakeBlob(bytes: number[], type = ""): Blob {
  const u8 = new Uint8Array(bytes);
  const slice = (start: number, end?: number) =>
    fakeBlob(Array.from(u8.slice(start, end)), type);
  return {
    size: u8.byteLength,
    type,
    slice,
    arrayBuffer: async () =>
      u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
  } as unknown as Blob;
}

const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]; // "%PDF-1.7"

describe("zipFileService.isZipFile", () => {
  test("accepts .zip whatever MIME the browser reports", () => {
    for (const type of ["application/zip", "application/octet-stream", ""]) {
      expect(
        zipFileService.isZipFile(new File(["PK"], "archive.zip", { type })),
      ).toBe(true);
    }
  });

  test("accepts the extension case-insensitively", () => {
    expect(zipFileService.isZipFile(new File(["PK"], "ARCHIVE.ZIP"))).toBe(
      true,
    );
  });

  test("rejects ZIP-based documents and comics", () => {
    for (const name of [
      "report.docx",
      "sheet.xlsx",
      "slides.pptx",
      "notes.odt",
      "book.epub",
      "comic.cbz",
      "comic.cbr",
    ]) {
      for (const type of ["application/zip", "application/octet-stream"]) {
        expect(zipFileService.isZipFile(new File(["PK"], name, { type }))).toBe(
          false,
        );
      }
    }
  });

  test("rejects an untyped archive without a .zip name", () => {
    expect(
      zipFileService.isZipFile(
        new File(["PK"], "download", { type: "application/zip" }),
      ),
    ).toBe(false);
  });
});

describe("zipFileService.isZipFileStub", () => {
  const stub = (name: string, type = "") =>
    ({ name, type }) as Parameters<typeof zipFileService.isZipFileStub>[0];

  test("follows the same archive-name rule as the File variant", () => {
    expect(zipFileService.isZipFileStub(stub("archive.zip"))).toBe(true);
    expect(
      zipFileService.isZipFileStub(stub("report.docx", "application/zip")),
    ).toBe(false);
    expect(
      zipFileService.isZipFileStub(stub("comic.cbz", "application/zip")),
    ).toBe(false);
  });
});

describe("zipFileService.isZipResponse", () => {
  describe("signature is authoritative", () => {
    test("PK\\x03\\x04 -> ZIP", async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
        ),
      ).toBe(true);
    });

    test("PK\\x05\\x06 (empty archive) -> ZIP", async () => {
      expect(
        await zipFileService.isZipResponse(fakeBlob([0x50, 0x4b, 0x05, 0x06])),
      ).toBe(true);
    });

    test("PK\\x07\\x08 (spanned marker) -> ZIP", async () => {
      expect(
        await zipFileService.isZipResponse(fakeBlob([0x50, 0x4b, 0x07, 0x08])),
      ).toBe(true);
    });

    test("%PDF signature overrides a ZIP Content-Type", async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(PDF_BYTES),
          "application/zip",
        ),
      ).toBe(false);
    });
  });

  // Bug-trigger Content-Types: previously misrouted PDFs into ZIP extraction.
  describe("bug-trigger Content-Types must not misroute a PDF", () => {
    test('"application/pdf;charset=UTF-8" + %PDF -> NOT ZIP', async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(PDF_BYTES),
          "application/pdf;charset=UTF-8",
        ),
      ).toBe(false);
    });

    test('"application/octet-stream" + %PDF -> NOT ZIP', async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(PDF_BYTES),
          "application/octet-stream",
        ),
      ).toBe(false);
    });

    test('"APPLICATION/PDF" + %PDF -> NOT ZIP', async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(PDF_BYTES),
          "APPLICATION/PDF",
        ),
      ).toBe(false);
    });
  });

  describe("Content-Type fallback when signature is inconclusive", () => {
    const UNKNOWN_BYTES = [0xff, 0xff, 0xff, 0xff];

    test('unknown bytes + "application/zip" -> ZIP', async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(UNKNOWN_BYTES),
          "application/zip",
        ),
      ).toBe(true);
    });

    test('unknown bytes + "application/x-zip-compressed" -> ZIP', async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(UNKNOWN_BYTES),
          "application/x-zip-compressed",
        ),
      ).toBe(true);
    });

    test('unknown bytes + "application/json" -> NOT ZIP', async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(UNKNOWN_BYTES),
          "application/json",
        ),
      ).toBe(false);
    });

    test("unknown bytes, no hint, blob.type 'application/zip' -> ZIP", async () => {
      expect(
        await zipFileService.isZipResponse(
          fakeBlob(UNKNOWN_BYTES, "application/zip"),
        ),
      ).toBe(true);
    });
  });
});
