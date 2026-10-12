import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { PdfiumPageRenderer } from "@app/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";

// A4 in PDF points.
const A4_W = 595;
const A4_H = 842;

describe("PdfiumPageRenderer.deviceScale", () => {
  it("multiplies the zoom scale by the display ratio", () => {
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1.5, 2)).toBeCloseTo(3);
  });

  it("treats a 1x display as a plain zoom scale", () => {
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1.5, 1)).toBeCloseTo(1.5);
  });

  it("never renders BELOW the zoom scale on a sub-1x ratio", () => {
    // Browser zoomed out below 100%: upscaling would soften, so hold at 1x.
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1.5, 0.8)).toBeCloseTo(
      1.5,
    );
  });

  it("caps the ratio at 3 - beyond that is memory, not sharpness", () => {
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1, 4)).toBeCloseTo(3);
  });

  it("clamps a poster page to the pixel budget", () => {
    // 36x48in poster: 2592x3456pt. Unclamped 4x zoom on a 2x display would be
    // a 573MB bitmap; the budget holds one page under ~128MB of RGBA.
    const scale = PdfiumPageRenderer.deviceScale(2592, 3456, 4, 2);
    const { width, height } = PdfiumPageRenderer.rasterSize(2592, 3456, scale);
    expect(width * height).toBeLessThanOrEqual(32_000_000 * 1.01);
    expect(scale).toBeLessThan(8);
    expect(scale).toBeGreaterThan(1);
  });

  it("keeps ordinary pages essentially unclamped at max zoom on 2x", () => {
    // A4 at 8x sits right on the pixel budget, so the cap shaves ~0.01.
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 4, 2)).toBeCloseTo(8, 1);
  });
});

describe("PdfiumPageRenderer.rasterBudget", () => {
  it("renders an ordinary page at the requested scale", () => {
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, 2)).toEqual({
      width: 1190,
      height: 1684,
    });
  });

  it("holds a giant page inside the pixel budget, keeping its shape", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      100_000,
      100_000,
      1,
    );
    expect(width * height).toBeLessThanOrEqual(32_000_000);
    expect(width / height).toBeCloseTo(1, 2);
  });

  it("shrinks the width alone to the dimension limit, scaling the height with it", () => {
    // 200000x10pt: the uniform factor floors the 10pt axis at 1px instead of
    // rasterising it three times finer than the width.
    const { width, height } = PdfiumPageRenderer.rasterBudget(200_000, 10, 1);
    expect(width).toBe(32_768);
    expect(height).toBe(1);
  });

  it("shrinks the height alone to the dimension limit, scaling the width with it", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(10, 200_000, 1);
    expect(width).toBe(1);
    expect(height).toBe(32_768);
  });

  it("keeps the aspect ratio when the pixel budget is what binds", () => {
    // Both axes stay under the dimension limit here, so only the pixel product
    // limits the result, and it has to keep the page's 5:1 shape.
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      200_000,
      40_000,
      1,
    );
    expect(width * height).toBeLessThanOrEqual(32_000_000);
    expect(width / height).toBeCloseTo(5, 1);
  });

  it("stays inside the budget when the axes overflow a float product", () => {
    // The requested width * height overflows to Infinity, which no cap
    // expressed as `budget / product` can shrink.
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      1,
    );
    expect(Number.isFinite(width * height)).toBe(true);
    expect(width * height).toBeLessThanOrEqual(32_000_000);
    expect(width).toBe(height);
  });

  it("stays inside the budget when the scale overflows the product", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      A4_W,
      A4_H,
      1e300,
    );
    expect(Number.isFinite(width * height)).toBe(true);
    expect(width * height).toBeLessThanOrEqual(32_000_000);
    expect(width / height).toBeCloseTo(A4_W / A4_H, 1);
  });

  it("stays inside both limits when one requested axis overflows", () => {
    for (const [requestedW, requestedH] of [
      [Number.MAX_VALUE, A4_W],
      [A4_W, Number.MAX_VALUE],
    ]) {
      // scale * dimension overflows to Infinity before any cap can divide it,
      // so the bound has to land on the scale instead.
      const size = PdfiumPageRenderer.rasterBudget(requestedW, requestedH, 2);
      expect(Number.isInteger(size.width)).toBe(true);
      expect(Number.isInteger(size.height)).toBe(true);
      expect(size.width).toBeGreaterThanOrEqual(1);
      expect(size.height).toBeGreaterThanOrEqual(1);
      expect(size.width).toBeLessThanOrEqual(32_768);
      expect(size.height).toBeLessThanOrEqual(32_768);
      expect(size.width * size.height).toBeLessThanOrEqual(32_000_000);
    }
  });

  it("stays inside both limits when both requested axes overflow", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      2,
    );

    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
    expect(width).toBeLessThanOrEqual(32_768);
    expect(height).toBeLessThanOrEqual(32_768);
    expect(width * height).toBeLessThanOrEqual(32_000_000);
    expect(width).toBe(height);
  });

  it("falls back to 1x when the scale is not a positive finite number", () => {
    const plain = PdfiumPageRenderer.rasterBudget(A4_W, A4_H, 1);
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, Number.NaN)).toEqual(
      plain,
    );
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, 0)).toEqual(plain);
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, -3)).toEqual(plain);
  });

  it("falls back to a unit page when the dimensions are not finite", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2,
    );
    expect(Number.isFinite(width)).toBe(true);
    expect(Number.isFinite(height)).toBe(true);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});

const PAGE_W = 4;
const PAGE_H = 2;
const PAGE_BYTES = PAGE_W * PAGE_H * 4;
// PDFium requires scan buffers to be 4-byte aligned.
const BUFFER_PTR = 1024;
const PAINTED = 0x99;
const PADDING = 0x11;

interface RenderFakeOptions {
  /** Extra bytes per row, as a wider-than-requested stride would add. */
  pad?: number;
  /** Makes `malloc` fail, as it does when the wasm heap is exhausted. */
  outOfMemory?: boolean;
  /** Points the buffer outside the memory, so the heap view cannot be built. */
  strayBuffer?: boolean;
}

function fakePage(): Page {
  return { pagePtr: 42, width: PAGE_W, height: PAGE_H } as unknown as Page;
}

// jsdom has no ImageData, and the renderer only needs the constructor's shape.
class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

function makeRenderFake(options: RenderFakeOptions = {}) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const pad = options.pad ?? 0;
  const bitmaps = new Map<
    number,
    { ptr: number; stride: number; width: number; height: number }
  >();
  let nextHandle = 1;
  const module = {
    FPDFBitmap_CreateEx: vi.fn(
      (width: number, height: number, format: number, ptr: number, stride) => {
        if (format !== 4) {
          // 1 would be FPDFBitmap_Gray, whose pixels are one byte wide, so a
          // fake that painted four bytes for any format would hide the bug.
          throw new Error(`unsupported bitmap format ${format}`);
        }
        const handle = nextHandle++;
        bitmaps.set(handle, { ptr, stride: stride + pad, width, height });
        return handle;
      },
    ),
    FPDFBitmap_GetBuffer: vi.fn(
      (handle: number) => bitmaps.get(handle)?.ptr ?? 0,
    ),
    FPDFBitmap_GetStride: vi.fn(
      (handle: number) => bitmaps.get(handle)?.stride ?? 0,
    ),
    FPDFBitmap_FillRect: vi.fn(() => undefined),
    FPDF_RenderPageBitmap: vi.fn((handle: number) => {
      const bitmap = bitmaps.get(handle);
      if (!bitmap) return;
      const heap = new Uint8Array(memory.buffer);
      // Paint the padding too, so a copy that takes the padded width shows up.
      heap.fill(
        PADDING,
        bitmap.ptr,
        bitmap.ptr + bitmap.stride * bitmap.height,
      );
      for (let y = 0; y < bitmap.height; y++) {
        const row = bitmap.ptr + y * bitmap.stride;
        heap.fill(PAINTED, row, row + bitmap.width * 4);
      }
    }),
    FPDFBitmap_Destroy: vi.fn((handle: number) => {
      bitmaps.delete(handle);
    }),
    pdfium: {
      wasmExports: {
        malloc: vi.fn(() =>
          options.outOfMemory
            ? 0
            : options.strayBuffer
              ? memory.buffer.byteLength + 4096
              : BUFFER_PTR,
        ),
        free: vi.fn(() => undefined),
        memory,
      },
    },
  };
  const editor = {
    module: module as unknown as WrappedPdfiumModule,
    formEnvironment: () => 0,
    notifyFormPageLoaded: vi.fn(() => undefined),
  } as unknown as EditorDocument;
  return { module, editor, memory };
}

describe("PdfiumPageRenderer.render", () => {
  beforeEach(() => {
    vi.stubGlobal("ImageData", FakeImageData);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies a contiguous bitmap into the returned pixels", async () => {
    const { module, editor } = makeRenderFake();

    const image = await PdfiumPageRenderer.render(editor, fakePage(), 1);

    expect(image.width).toBe(PAGE_W);
    expect(image.height).toBe(PAGE_H);
    expect(Array.from(image.data)).toEqual(new Array(PAGE_BYTES).fill(PAINTED));
    expect(module.FPDFBitmap_Destroy).toHaveBeenCalledTimes(1);
  });

  it("creates the bitmap as BGRA, the format the copy-out reads", async () => {
    const { module, editor } = makeRenderFake();

    await PdfiumPageRenderer.render(editor, fakePage(), 1);

    // 4 is FPDFBitmap_BGRA; 1 would be FPDFBitmap_Gray, a single byte per
    // pixel read back as four.
    expect(module.FPDFBitmap_CreateEx).toHaveBeenCalledWith(
      PAGE_W,
      PAGE_H,
      4,
      expect.any(Number),
      PAGE_W * 4,
    );
  });

  it("drops the padding rows when the stride is wider than the row", async () => {
    const { editor } = makeRenderFake({ pad: 8 });

    const image = await PdfiumPageRenderer.render(editor, fakePage(), 1);

    expect(image.data.length).toBe(PAGE_BYTES);
    expect(Array.from(image.data)).not.toContain(PADDING);
  });

  it("keeps the pixels after the bitmap is destroyed and the heap grows", async () => {
    const { editor, memory } = makeRenderFake();

    const image = await PdfiumPageRenderer.render(editor, fakePage(), 1);
    // A heap-backed view would detach on the grow and read freed storage here.
    new Uint8Array(memory.buffer).fill(0);
    memory.grow(1);

    expect(Array.from(image.data)).toEqual(new Array(PAGE_BYTES).fill(PAINTED));
  });

  it("destroys the bitmap when the pixels cannot be read", async () => {
    const { module, editor } = makeRenderFake({ strayBuffer: true });

    await expect(
      PdfiumPageRenderer.render(editor, fakePage(), 1),
    ).rejects.toThrow();
    expect(module.FPDFBitmap_Destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects without a bitmap when the allocator refuses the page", async () => {
    const { module, editor } = makeRenderFake({ outOfMemory: true });

    await expect(
      PdfiumPageRenderer.render(editor, fakePage(), 1),
    ).rejects.toThrow(`could not allocate a ${PAGE_W}x${PAGE_H} page bitmap`);
    expect(module.FPDFBitmap_Destroy).not.toHaveBeenCalled();
  });
});
