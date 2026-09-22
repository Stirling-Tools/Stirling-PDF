import { describe, it, expect, vi, afterEach } from "vitest";
import { containsEncryptMarker } from "@app/utils/thumbnailUtils";
import {
  PdfiumOpenError,
  FPDF_ERR_PASSWORD,
} from "@app/services/pdfiumService";

/**
 * The only signal that a PDF too large to fully parse is password-protected.
 * Tested over raw bytes because jsdom's Blob does not return its own contents
 * from arrayBuffer(), so the slicing wrapper cannot be exercised here.
 */

/** PDF-shaped bytes with `trailer` written at the very end. */
function bytesEndingWith(trailer: string, size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20); // padding
  const tail = new TextEncoder().encode(trailer);
  bytes.set(tail, size - tail.length);
  return bytes;
}

describe("containsEncryptMarker — trailer probe for large PDFs", () => {
  it("detects /Encrypt in a trailer dictionary", () => {
    const bytes = bytesEndingWith(
      "trailer\n<< /Size 9 /Root 1 0 R /Encrypt 8 0 R >>\nstartxref\n1234\n%%EOF\n",
      4096,
    );
    expect(containsEncryptMarker(bytes)).toBe(true);
  });

  it("leaves an unencrypted document alone", () => {
    const bytes = bytesEndingWith(
      "trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n1234\n%%EOF\n",
      4096,
    );
    expect(containsEncryptMarker(bytes)).toBe(false);
  });

  it("does not match longer keys that merely start the same way", () => {
    const bytes = bytesEndingWith("<< /EncryptionAware true >>\n%%EOF\n", 512);
    expect(containsEncryptMarker(bytes)).toBe(false);
  });

  it("survives binary bytes around the marker", () => {
    // Under UTF-8 these become replacement characters and consume the marker.
    const prefix = new Uint8Array([0xff, 0xfe, 0x80, 0x00, 0x9d]);
    const marker = new TextEncoder().encode(" /Encrypt 8 0 R >>");
    const bytes = new Uint8Array(prefix.length + marker.length);
    bytes.set(prefix);
    bytes.set(marker, prefix.length);
    expect(containsEncryptMarker(bytes)).toBe(true);
  });

  it("reports nothing for an empty read", () => {
    expect(containsEncryptMarker(new Uint8Array(0))).toBe(false);
  });
});

/**
 * thumbnailUtils identifies password-protected PDFs from the error that
 * openRawDocumentSafe throws. That guard used to regex the error *message* for
 * "error 4"; when the message changed the detection silently stopped firing
 * with no test failing. These pin the contract it now relies on instead.
 */
describe("encrypted-PDF identification contract", () => {
  it("marks a password failure with the password code", () => {
    const err = new PdfiumOpenError(FPDF_ERR_PASSWORD);
    expect(err).toBeInstanceOf(PdfiumOpenError);
    expect(err.code).toBe(FPDF_ERR_PASSWORD);
  });

  it("does not mistake another open failure for a password prompt", () => {
    expect(new PdfiumOpenError(2).code).not.toBe(FPDF_ERR_PASSWORD);
  });

  it("carries the code out of band, not in the message", () => {
    // Guarding on message text is what broke before - assert it stays unrelied on.
    expect(new PdfiumOpenError(FPDF_ERR_PASSWORD).message).not.toContain(
      `error ${FPDF_ERR_PASSWORD}`,
    );
  });
});

/**
 * Image thumbnails decode at tooltip size (shrink-on-load) instead of
 * full-res-then-downscale. jsdom has no createImageBitmap, so the fast path
 * is exercised with a stub; the fallback path uses the real FileReader.
 */
describe("generateThumbnailForFile — images", () => {
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  /** A PNG header carrying IHDR dimensions, as the size probe reads them. */
  function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(24);
    bytes.set(pngBytes, 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
  }

  /** jsdom's Blob polyfill returns fixed bytes, so serve the header directly. */
  function fileWithHeader(
    header: Uint8Array<ArrayBuffer>,
    name = "photo.png",
    type = "image/png",
  ): File {
    const file = new File([header], name, { type });
    vi.spyOn(file, "slice").mockReturnValue({
      arrayBuffer: async () => header.buffer,
    } as unknown as Blob);
    return file;
  }

  function stubBitmapPipeline() {
    const closed: string[] = [];
    const draws: Array<[number, number]> = [];
    const bitmap = {
      width: 320,
      height: 240,
      close: () => void closed.push("closed"),
    };
    const calls: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).createImageBitmap = async (
      _blob: Blob,
      options?: ImageBitmapOptions,
    ) => {
      calls.push({ ...(options as object) });
      return bitmap;
    };
    const realCreateElement = document.createElement.bind(document);
    type CreateElement = (tagName: string, ...rest: unknown[]) => HTMLElement;
    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      ...rest: unknown[]
    ) => {
      if (tagName !== "canvas") {
        return (realCreateElement as CreateElement)(tagName, ...rest);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          fillRect: () => {},
          drawImage: (img: unknown, x: number, y: number) => {
            draws.push([x, y]);
            expect(img).toBe(bitmap);
          },
        }),
        toDataURL: (type?: string) => {
          expect(type).toBe("image/jpeg");
          return "data:image/jpeg;base64,stub";
        },
      };
    }) as typeof document.createElement);
    return { bitmap, closed, draws, calls };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).createImageBitmap;
  });

  it("decodes at thumbnail width and closes the bitmap", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const { closed, draws, calls } = stubBitmapPipeline();
    const file = new File([pngBytes], "photo.png", { type: "image/png" });
    const thumb = await generateThumbnailForFile(file);
    expect(thumb).toBe("data:image/jpeg;base64,stub");
    expect(calls[0].resizeWidth).toBe(320);
    expect(calls[0].resizeHeight).toBeUndefined();
    expect(draws).toEqual([[0, 0]]);
    expect(closed).toEqual(["closed"]);
  });

  it("passes both dimensions when the header gives the source size", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const { closed, calls } = stubBitmapPipeline();
    const file = fileWithHeader(pngHeader(400, 300));
    const thumb = await generateThumbnailForFile(file);
    expect(thumb).toBe("data:image/jpeg;base64,stub");
    expect(calls[0]).toEqual({
      resizeWidth: 320,
      resizeHeight: 240,
      resizeQuality: "high",
      imageOrientation: "from-image",
    });
    expect(closed).toEqual(["closed"]);
  });

  it("bounds the resize request for extreme-aspect images", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const { calls } = stubBitmapPipeline();
    const file = fileWithHeader(pngHeader(1, 100000));
    await generateThumbnailForFile(file);
    expect(calls[0].resizeWidth).toBe(1);
    expect(calls[0].resizeHeight).toBe(320);
  });

  it("reads JPEG dimensions from the start-of-frame marker", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const { calls } = stubBitmapPipeline();
    const jpeg = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xe0,
      0x00,
      0x04,
      0x00,
      0x00, // APP0, length 4
      0xff,
      0xc0,
      0x00,
      0x0b,
      0x08,
      0x01,
      0x2c,
      0x02,
      0x58,
      0x01,
      0x01,
      0x11,
    ]);
    const file = fileWithHeader(jpeg, "photo.jpg", "image/jpeg");
    await generateThumbnailForFile(file);
    expect(calls[0].resizeWidth).toBe(320);
    expect(calls[0].resizeHeight).toBe(160);
  });

  it("falls back to the data URL when decode-at-size is unavailable", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const file = new File([pngBytes], "photo.png", { type: "image/png" });
    const thumb = await generateThumbnailForFile(file);
    expect(thumb.startsWith("data:image/png;base64,")).toBe(true);
  });
});
