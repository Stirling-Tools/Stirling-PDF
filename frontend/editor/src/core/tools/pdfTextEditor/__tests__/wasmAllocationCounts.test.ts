import { describe, expect, it } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  measureObjRightEdgePt,
  measureObjSpanPt,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import { setCharcodesOn } from "@app/tools/pdfTextEditor/charcode/charcodeRegistry";

interface Bounds {
  left: number;
  right: number;
}

// Byte-addressed stub over a Float32 heap, mirroring the DisplayTransform
// test's module stub so pointer arithmetic is exercised, not bypassed.
function stubModule(boundsByPtr: Map<number, Bounds>) {
  const heapBuf = new ArrayBuffer(1024);
  const heapF32 = new Float32Array(heapBuf);
  const heapU8 = new Uint8Array(heapBuf);
  let next = 4;
  let mallocs = 0;
  let frees = 0;
  const mod: Record<string, unknown> = {
    pdfium: {
      HEAPU8: heapU8,
      wasmExports: {
        malloc: (n: number): number => {
          mallocs += 1;
          const p = next;
          next += n;
          return p;
        },
        free: (): void => {
          frees += 1;
        },
      },
      getValue: (ptr: number, type: string): number =>
        type === "float" ? heapF32[ptr >> 2] : 0,
    },
    FPDFText_SetCharcodes: (): boolean => true,
    FPDFPageObj_GetBounds: (
      ptr: number,
      l: number,
      b: number,
      r: number,
      t: number,
    ): number => {
      const box = boundsByPtr.get(ptr);
      if (!box) return 0;
      heapF32[l >> 2] = box.left;
      heapF32[b >> 2] = 0;
      heapF32[r >> 2] = box.right;
      heapF32[t >> 2] = 0;
      return 1;
    },
  };
  return {
    module: mod as unknown as WrappedPdfiumModule,
    mallocs: () => mallocs,
    frees: () => frees,
  };
}

describe("edit-path wasm scratch allocations", () => {
  it("measureObjRightEdgePt allocates its scratch block once and reuses it", () => {
    const stub = stubModule(new Map([[7, { left: 1, right: 42 }]]));
    expect(measureObjRightEdgePt(stub.module, 7)).toBe(42);
    const afterFirst = stub.mallocs();
    expect(measureObjRightEdgePt(stub.module, 7)).toBe(42);
    // The whole point of the pool: the second call allocates nothing.
    expect(stub.mallocs()).toBe(afterFirst);
    expect(stub.frees()).toBe(0);
  });

  it("measureObjSpanPt reuses one block across every pointer and every call", () => {
    const stub = stubModule(
      new Map([
        [1, { left: 5, right: 10 }],
        [2, { left: 2, right: 20 }],
        [3, { left: 7, right: 12 }],
      ]),
    );
    expect(measureObjSpanPt(stub.module, [1, 2, 3])).toEqual({
      left: 2,
      right: 20,
    });
    const afterFirst = stub.mallocs();
    expect(measureObjSpanPt(stub.module, [1, 2, 3])).toEqual({
      left: 2,
      right: 20,
    });
    expect(stub.mallocs()).toBe(afterFirst);
    expect(stub.frees()).toBe(0);
  });

  it("measureObjRightEdgePt reports 0 for an unreadable object without freeing", () => {
    const stub = stubModule(new Map());
    expect(measureObjRightEdgePt(stub.module, 9)).toBe(0);
    expect(stub.mallocs()).toBe(1);
    expect(stub.frees()).toBe(0);
  });

  it("measureObjSpanPt returns null when nothing is measurable", () => {
    const stub = stubModule(new Map());
    expect(measureObjSpanPt(stub.module, [1, 2])).toBeNull();
    expect(stub.mallocs()).toBe(1);
    expect(stub.frees()).toBe(0);
  });

  it("setCharcodesOn allocates its scratch block once and reuses it across calls", () => {
    const stub = stubModule(new Map());
    expect(setCharcodesOn(stub.module, 1, [65, 66])).toBe(true);
    const afterFirst = stub.mallocs();
    expect(setCharcodesOn(stub.module, 1, [67, 68])).toBe(true);
    expect(stub.mallocs()).toBe(afterFirst);
    expect(stub.frees()).toBe(0);
  });
});
