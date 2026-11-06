import { describe, expect, it, vi } from "vitest";
import { Task } from "@embedpdf/models";
import { PdfEngine } from "@embedpdf/engines";
import { createHybridImageConverter } from "@embedpdf/engines/converters";
import { expectConsole } from "@editor/tests/failOnConsole";

interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const fakeEngine = (
  raw: RawImage,
  imageConverter: (get: () => RawImage) => Promise<Blob>,
) => {
  const rendered = new Task<RawImage, unknown>();
  rendered.resolve(raw);
  const executor = {
    renderPageRaw: () => rendered,
    destroy: vi.fn(),
  };
  return new PdfEngine(executor as never, {
    imageConverter,
  });
};

const page = { index: 0, size: { width: 1, height: 1 }, rotation: 0 };
const doc = { id: "doc", pages: [page] };

describe("PDFium raster transfer", () => {
  it("encodes the pixels received from the worker without copying them", async () => {
    const raw = {
      data: new Uint8ClampedArray([1, 2, 3, 4]),
      width: 1,
      height: 1,
    };
    let encoded: RawImage | undefined;
    const engine = fakeEngine(raw, async (getImageData) => {
      encoded = getImageData();
      return new Blob(["encoded"]);
    });

    await engine.renderPage(doc as never, page as never).toPromise();

    expect(encoded?.data).toBe(raw.data);
  });

  it("hands the pixels to the encoder pool without copying them", async () => {
    const data = new Uint8ClampedArray([1, 2, 3, 4]);
    const encode = vi.fn().mockResolvedValue(new Blob(["encoded"]));
    const converter = createHybridImageConverter({ encode } as never);

    await converter(() => ({ data, width: 1, height: 1 }), "image/png");

    expect(encode.mock.calls[0][0].data).toBe(data);
  });

  it("rethrows when the encoder failed without usable pixels", async () => {
    expectConsole.warn(/Worker encoding failed/);
    // A detached buffer reports zero length; the original pixels are gone.
    const detached = new Uint8ClampedArray(0);
    const failure = new Error("worker terminated");
    const encode = vi.fn().mockRejectedValue(failure);
    const converter = createHybridImageConverter({ encode } as never);

    await expect(
      converter(() => ({ data: detached, width: 1, height: 1 }), "image/png"),
    ).rejects.toThrow("worker terminated");
  });

  it("falls back to the pixels the encoder worker handed back on failure", async () => {
    expectConsole.warn(/Worker encoding failed/);
    const original = new Uint8ClampedArray([1, 2, 3, 4]);
    const returned = new Uint8ClampedArray([9, 9, 9, 9]);
    const failure = Object.assign(new Error("no OffscreenCanvas"), {
      imageData: { data: returned, width: 1, height: 1 },
    });
    const encode = vi.fn().mockRejectedValue(failure);
    const converter = createHybridImageConverter({ encode } as never);

    const putImageData = vi.fn();
    class FakeImageData {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    }
    vi.stubGlobal("ImageData", FakeImageData);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData,
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback: BlobCallback) => callback(new Blob(["fallback"])),
    );

    await converter(
      () => ({ data: original, width: 1, height: 1 }),
      "image/png",
    );

    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(
      (putImageData.mock.calls[0][0] as { data: Uint8ClampedArray }).data,
    ).toBe(returned);
  });
});
