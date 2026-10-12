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
      _format: number,
      firstScan: number,
      stride: number,
    ) => {
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
  return { module, malloc, free, FPDFBitmap_CreateEx, FPDFBitmap_Destroy };
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

  it("passes BGRA so the copied pixels keep their channel order", () => {
    const { module, FPDFBitmap_CreateEx } = makeModule();

    const bitmap = acquireRaster(module, 512, 512);

    expect(FPDFBitmap_CreateEx).toHaveBeenCalledWith(
      512,
      512,
      RASTER_FORMAT_BGRA,
      expect.any(Number),
      512 * 4,
    );
    releaseRaster(module, bitmap, 512);
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
