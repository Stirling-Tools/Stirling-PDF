import { describe, expect, test } from "vitest";
import { isZipResponse } from "@app/hooks/tools/shared/useToolOperation";

// jsdom's Blob.slice(start, end).arrayBuffer() returns an empty buffer (the
// slice doesn't preserve underlying bytes in this version), so a real Blob
// would never exercise the magic-byte branch in tests even though it works in
// every real browser/Tauri WebView. We duck-type the parts of Blob that
// isZipResponse actually touches (.type, .slice, .arrayBuffer) so the test
// faithfully drives the production code path.
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

describe("isZipResponse", () => {
  describe("file signature is authoritative", () => {
    test("PK\\x03\\x04 (ZIP local-file header) -> ZIP", async () => {
      expect(
        await isZipResponse(fakeBlob([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])),
      ).toBe(true);
    });

    test("PK\\x05\\x06 (empty archive) -> ZIP", async () => {
      expect(await isZipResponse(fakeBlob([0x50, 0x4b, 0x05, 0x06]))).toBe(
        true,
      );
    });

    test("PK\\x07\\x08 (spanned/data-descriptor marker) -> ZIP", async () => {
      expect(await isZipResponse(fakeBlob([0x50, 0x4b, 0x07, 0x08]))).toBe(
        true,
      );
    });

    test("%PDF header overrides any Content-Type", async () => {
      // Even if a misconfigured proxy claims this is a ZIP, the signature wins.
      expect(await isZipResponse(fakeBlob(PDF_BYTES), "application/zip")).toBe(
        false,
      );
    });
  });

  // The bug under test: a merged PDF arriving with a non-canonical Content-Type
  // (charset suffix, octet-stream, casing) used to fall through to ZIP
  // extraction and silently produce no output. These cases must now classify
  // as a single-file response, not a ZIP.
  describe("regression: bug-trigger Content-Types must not misroute a PDF", () => {
    test('"application/pdf;charset=UTF-8" + %PDF bytes -> NOT ZIP', async () => {
      expect(
        await isZipResponse(
          fakeBlob(PDF_BYTES),
          "application/pdf;charset=UTF-8",
        ),
      ).toBe(false);
    });

    test('"application/octet-stream" + %PDF bytes -> NOT ZIP', async () => {
      expect(
        await isZipResponse(fakeBlob(PDF_BYTES), "application/octet-stream"),
      ).toBe(false);
    });

    test('"APPLICATION/PDF" (uppercased) + %PDF bytes -> NOT ZIP', async () => {
      expect(await isZipResponse(fakeBlob(PDF_BYTES), "APPLICATION/PDF")).toBe(
        false,
      );
    });
  });

  describe("Content-Type fallback when signature is inconclusive", () => {
    const UNKNOWN_BYTES = [0xff, 0xff, 0xff, 0xff];

    test('unknown bytes + "application/zip" hint -> ZIP', async () => {
      expect(
        await isZipResponse(fakeBlob(UNKNOWN_BYTES), "application/zip"),
      ).toBe(true);
    });

    test('unknown bytes + "application/x-zip-compressed" hint -> ZIP', async () => {
      expect(
        await isZipResponse(
          fakeBlob(UNKNOWN_BYTES),
          "application/x-zip-compressed",
        ),
      ).toBe(true);
    });

    test('unknown bytes + "application/json" hint -> NOT ZIP', async () => {
      expect(
        await isZipResponse(fakeBlob(UNKNOWN_BYTES), "application/json"),
      ).toBe(false);
    });

    test("unknown bytes + no hint, blob.type 'application/zip' -> ZIP", async () => {
      expect(
        await isZipResponse(fakeBlob(UNKNOWN_BYTES, "application/zip")),
      ).toBe(true);
    });

    test("hint is matched case-insensitively", async () => {
      expect(
        await isZipResponse(fakeBlob(UNKNOWN_BYTES), "Application/ZIP"),
      ).toBe(true);
    });
  });

  describe("short and empty blobs do not throw", () => {
    test("empty blob + PDF hint -> NOT ZIP", async () => {
      expect(await isZipResponse(fakeBlob([]), "application/pdf")).toBe(false);
    });

    test("empty blob + ZIP hint -> ZIP via fallback", async () => {
      expect(await isZipResponse(fakeBlob([]), "application/zip")).toBe(true);
    });

    test("2-byte 'PK' with no hint -> NOT ZIP (sig[2] missing)", async () => {
      expect(await isZipResponse(fakeBlob([0x50, 0x4b]))).toBe(false);
    });

    test("2-byte 'PK' with ZIP hint -> ZIP via fallback", async () => {
      expect(
        await isZipResponse(fakeBlob([0x50, 0x4b]), "application/zip"),
      ).toBe(true);
    });
  });
});
