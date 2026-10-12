import { describe, expect, it, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  acquireRaster,
  RASTER_FORMAT_BGRA,
  releaseRaster,
  releaseRasterPool,
} from "@app/tools/pdfTextEditor/pdfium/rasterPool";

interface FakeOptions {
  /** Widths whose bitmap creation should fail, mimicking a refused handle. */
  refuseWidths?: number[];
  /** Makes `malloc` fail, as it does when the wasm heap is exhausted. */
  outOfMemory?: boolean;
}

function makeModule(options: FakeOptions = {}) {
  const buffers = new Map<number, { ptr: number; stride: number }>();
  let nextPtr = 0;
  let nextBitmap = 100;
  const malloc = vi.fn((_bytes: number) =>
    options.outOfMemory ? 0 : (nextPtr += 4096),
  );
  const free = vi.fn((_ptr: number) => undefined);
  const FPDFBitmap_CreateEx = vi.fn(
    (
      width: number,
      _h: number,
      format: number,
      firstScan: number,
      stride: number,
    ) => {
      if (format !== 4) {
        // Rejects what the real API reads as FPDFBitmap_Gray/BGR/BGRx instead
        // of painting four bytes per pixel regardless, so a wrong constant
        // cannot pass a test.
        throw new Error(`unsupported bitmap format ${format}`);
      }
      if (options.refuseWidths?.includes(width)) return 0;
      const bitmap = nextBitmap++;
      buffers.set(bitmap, { ptr: firstScan, stride });
      return bitmap;
    },
  );
  const FPDFBitmap_GetBuffer = vi.fn(
    (bitmap: number) => buffers.get(bitmap)?.ptr ?? 0,
  );
  const FPDFBitmap_GetStride = vi.fn(
    (bitmap: number) => buffers.get(bitmap)?.stride ?? 0,
  );
  const FPDFBitmap_Destroy = vi.fn((bitmap: number) => {
    buffers.delete(bitmap);
  });
  const module = {
    FPDFBitmap_CreateEx,
    FPDFBitmap_GetBuffer,
    FPDFBitmap_GetStride,
    FPDFBitmap_Destroy,
    pdfium: { wasmExports: { malloc, free } },
  } as unknown as WrappedPdfiumModule;
  return {
    module,
    malloc,
    free,
    FPDFBitmap_CreateEx,
    FPDFBitmap_Destroy,
    FPDFBitmap_GetBuffer,
  };
}

describe("rasterPool", () => {
  it("serves the next render of the same size from the retained buffer", () => {
    const { module, malloc, free } = makeModule();
    const first = acquireRaster(module, 512, 512);
    releaseRaster(module, first, 512);
    const second = acquireRaster(module, 512, 512);

    expect(malloc).toHaveBeenCalledTimes(1);
    expect(free).not.toHaveBeenCalled();
    expect(second).not.toBe(first);
    releaseRaster(module, second, 512);
  });

  it("frees storage too small to be worth retaining", () => {
    const { module, free } = makeModule();
    const bitmap = acquireRaster(module, 64, 64);

    releaseRaster(module, bitmap, 64);

    expect(free).toHaveBeenCalledTimes(1);
  });

  it("retains at most two slots, dropping the smallest", () => {
    const { module, free } = makeModule();
    for (const size of [512, 768, 1024]) {
      const bitmap = acquireRaster(module, size, size);
      releaseRaster(module, bitmap, size);
    }
    expect(free).toHaveBeenCalledTimes(1);

    free.mockClear();
    releaseRasterPool(module);
    expect(free).toHaveBeenCalledTimes(2);
  });

  it("allocates fresh storage when every slot is too small", () => {
    const { module, malloc } = makeModule();
    const small = acquireRaster(module, 512, 512);
    releaseRaster(module, small, 512);

    const large = acquireRaster(module, 2048, 2048);

    expect(malloc).toHaveBeenCalledTimes(2);
    releaseRaster(module, large, 2048);
  });

  it("passes the BGRA format identifier, not the Create() alpha boolean", () => {
    const { module, FPDFBitmap_CreateEx } = makeModule();

    const bitmap = acquireRaster(module, 512, 512);

    // 4 is FPDFBitmap_BGRA. The format the pool used to pass, 1, is
    // FPDFBitmap_Gray: the old code carried over the alpha boolean of
    // FPDFBitmap_Create, where 1 is not a format at all.
    expect(FPDFBitmap_CreateEx).toHaveBeenCalledWith(
      512,
      512,
      4,
      expect.any(Number),
      512 * 4,
    );
    expect(RASTER_FORMAT_BGRA).toBe(4);
    releaseRaster(module, bitmap, 512);
  });

  it("keeps a reused buffer's capacity, not the size of the bitmap in it", () => {
    const { module, malloc } = makeModule();
    const large = acquireRaster(module, 4096, 4096);
    releaseRaster(module, large, 4096);

    const small = acquireRaster(module, 512, 512);
    releaseRaster(module, small, 512);

    // The 64 MB block still serves the next large page: booking the small
    // bitmap's 1 MB as the slot's size would have hidden 63 MB from the
    // retention budget and sent this render to the allocator.
    const again = acquireRaster(module, 4096, 4032);

    expect(malloc).toHaveBeenCalledTimes(1);
    releaseRaster(module, again, 4032);
  });

  it("never hands one live backing store to two bitmaps", () => {
    const { module, malloc, FPDFBitmap_GetBuffer } = makeModule();
    const first = acquireRaster(module, 512, 512);
    const second = acquireRaster(module, 512, 512);

    expect(malloc).toHaveBeenCalledTimes(2);
    expect(FPDFBitmap_GetBuffer(first)).not.toBe(FPDFBitmap_GetBuffer(second));
    releaseRaster(module, first, 512);
    releaseRaster(module, second, 512);
  });

  it("does not retain a buffer larger than the whole budget", () => {
    const { module, free } = makeModule();

    // 8192 x 8192 x 4 = 256 MB, four times what the pool may keep.
    const bitmap = acquireRaster(module, 8192, 8192);
    releaseRaster(module, bitmap, 8192);

    expect(free).toHaveBeenCalledTimes(1);
  });

  it("frees the scan buffer when the bitmap handle is refused", () => {
    const { module, free } = makeModule({ refuseWidths: [512] });

    const bitmap = acquireRaster(module, 512, 512);

    expect(bitmap).toBe(0);
    expect(free).toHaveBeenCalledTimes(1);
  });

  it("returns 0 without freeing anything when the allocator refuses", () => {
    const { module, free } = makeModule({ outOfMemory: true });

    expect(acquireRaster(module, 512, 512)).toBe(0);
    expect(free).not.toHaveBeenCalled();
  });

  it("ignores a bitmap that was never created", () => {
    const { module, FPDFBitmap_Destroy, free } = makeModule();

    releaseRaster(module, 0, 512);

    expect(FPDFBitmap_Destroy).not.toHaveBeenCalled();
    expect(free).not.toHaveBeenCalled();
  });
});
