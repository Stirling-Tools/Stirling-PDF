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
    vi.spyOn(file, "slice").mockImplementation(
      (start?: number, end?: number) => {
        const part = header.slice(start ?? 0, end ?? header.length);
        return { arrayBuffer: async () => part.buffer } as unknown as Blob;
      },
    );
    return file;
  }

  /** Minimal JPEG: optional EXIF orientation, optional padding before the SOF. */
  function buildJpeg(
    width: number,
    height: number,
    options: { orientation?: number; padding?: number } = {},
  ): Uint8Array<ArrayBuffer> {
    const parts: number[] = [0xff, 0xd8];
    const pushSegment = (marker: number, payload: number[]) => {
      const length = payload.length + 2;
      parts.push(0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload);
    };
    if (options.orientation) {
      pushSegment(0xe1, [
        0x45,
        0x78,
        0x69,
        0x66,
        0x00,
        0x00, // "Exif\0\0"
        0x49,
        0x49,
        0x2a,
        0x00,
        0x08,
        0x00,
        0x00,
        0x00, // TIFF header, IFD at 8
        0x01,
        0x00, // one entry
        0x12,
        0x01,
        0x03,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00, // orientation tag
        options.orientation,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00, // no next IFD
      ]);
    }
    let padding = options.padding ?? 0;
    while (padding > 0) {
      const chunk = Math.min(padding, 0xffff - 2);
      pushSegment(0xfe, new Array<number>(chunk).fill(0));
      padding -= chunk;
    }
    parts.push(
      0xff,
      0xc0,
      0x00,
      0x0b,
      0x08,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      0x01,
      0x01,
      0x11,
      0xff,
      0xda,
    );
    return new Uint8Array(parts);
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

  it("skips the decode when the header gives no dimensions", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const { closed, draws, calls } = stubBitmapPipeline();
    const file = new File([pngBytes], "photo.png", { type: "image/png" });
    const thumb = await generateThumbnailForFile(file);
    // A width-only resize would let an extreme aspect ratio ask for an
    // arbitrarily tall bitmap, so this falls back to the data URL instead.
    expect(calls).toEqual([]);
    expect(draws).toEqual([]);
    expect(closed).toEqual([]);
    expect(thumb.startsWith("data:image/png")).toBe(true);
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
    const file = fileWithHeader(buildJpeg(600, 300), "photo.jpg", "image/jpeg");
    await generateThumbnailForFile(file);
    expect(calls[0].resizeWidth).toBe(320);
    expect(calls[0].resizeHeight).toBe(160);
  });

  it("swaps axes for EXIF orientations that rotate the image", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const { calls } = stubBitmapPipeline();
    const file = fileWithHeader(
      buildJpeg(600, 300, { orientation: 6 }),
      "photo.jpg",
      "image/jpeg",
    );
    await generateThumbnailForFile(file);
    expect(calls[0].resizeWidth).toBe(160);
    expect(calls[0].resizeHeight).toBe(320);
  });

  it("finds a JPEG start-of-frame behind a large metadata segment", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const { calls } = stubBitmapPipeline();
    const file = fileWithHeader(
      buildJpeg(400, 300, { padding: 300 * 1024 }),
      "photo.jpg",
      "image/jpeg",
    );
    await generateThumbnailForFile(file);
    expect(calls[0].resizeWidth).toBe(320);
    expect(calls[0].resizeHeight).toBe(240);
  });

  it("falls back to the data URL when decode-at-size is unavailable", async () => {
    const { generateThumbnailForFile } =
      await import("@app/utils/thumbnailUtils");
    const file = new File([pngBytes], "photo.png", { type: "image/png" });
    const thumb = await generateThumbnailForFile(file);
    expect(thumb.startsWith("data:image/png;base64,")).toBe(true);
  });
});
