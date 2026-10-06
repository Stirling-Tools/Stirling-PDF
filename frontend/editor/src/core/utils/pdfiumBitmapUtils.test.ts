import { describe, expect, it } from "vitest";
import { copyRgbaToBgraHeap } from "@app/utils/pdfiumBitmapUtils";
import type { WrappedPdfiumModule } from "@app/services/pdfiumService";

function createMockPdfium(bufferSize: number): {
  m: WrappedPdfiumModule;
  heap: Uint8Array;
} {
  const heap = new Uint8Array(bufferSize);
  const m = {
    pdfium: {
      HEAPU8: heap,
    },
  } as unknown as WrappedPdfiumModule;
  return { m, heap };
}

describe("copyRgbaToBgraHeap", () => {
  it("swizzles RGBA to BGRA in-place when stride is unpadded and aligned", () => {
    const width = 2;
    const height = 2;
    const stride = width * 4;
    const { m, heap } = createMockPdfium(64);

    // 4 pixels: red, green, blue, white
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);

    copyRgbaToBgraHeap(m, rgba, 0, width, height, stride);

    // Expected BGRA
    const expected = [
      0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255,
    ];

    expect(Array.from(heap.subarray(0, 16))).toEqual(expected);
  });

  it("handles padded stride correctly with word swizzle", () => {
    const width = 1;
    const height = 2;
    const stride = 8; // padded from 4 to 8 bytes
    const { m, heap } = createMockPdfium(32);

    const rgba = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);

    copyRgbaToBgraHeap(m, rgba, 0, width, height, stride);

    const expected = [30, 20, 10, 40, 0, 0, 0, 0, 70, 60, 50, 80, 0, 0, 0, 0];

    expect(Array.from(heap.subarray(0, 16))).toEqual(expected);
  });

  it("falls back to byte-by-byte swizzle when unaligned", () => {
    const width = 1;
    const height = 1;
    const stride = 4;
    const { m, heap } = createMockPdfium(32);

    // Create an unaligned slice with byteOffset = 1
    const raw = new Uint8Array(8);
    raw.set([0, 1, 2, 3, 4, 0, 0, 0]);
    const unalignedRgba = raw.subarray(1, 5);
    expect(unalignedRgba.byteOffset % 4).not.toBe(0);

    copyRgbaToBgraHeap(m, unalignedRgba, 0, width, height, stride);

    const expected = [3, 2, 1, 4];
    expect(Array.from(heap.subarray(0, 4))).toEqual(expected);
  });

  it("throws RangeError if RGBA byteLength does not match width * height * 4", () => {
    const width = 2;
    const height = 2;
    const stride = width * 4;
    const { m } = createMockPdfium(64);

    const invalidRgba = new Uint8Array(12); // Expected 16 bytes

    expect(() => {
      copyRgbaToBgraHeap(m, invalidRgba, 0, width, height, stride);
    }).toThrow(RangeError);
  });
});
