import { describe, expect, it } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  measureObjRightEdgePt,
  measureObjSpanPt,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";

interface Bounds {
  left: number;
  right: number;
}

// Byte-addressed stub over a Float32 heap, mirroring the DisplayTransform
// test's module stub so pointer arithmetic is exercised, not bypassed.
function stubModule(boundsByPtr: Map<number, Bounds>) {
  const heap = new Float32Array(256);
  let next = 4;
  let mallocs = 0;
  let frees = 0;
  const mod: Record<string, unknown> = {
    pdfium: {
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
        type === "float" ? heap[ptr >> 2] : 0,
    },
    FPDFPageObj_GetBounds: (
      ptr: number,
      l: number,
      b: number,
      r: number,
      t: number,
    ): number => {
      const box = boundsByPtr.get(ptr);
      if (!box) return 0;
      heap[l >> 2] = box.left;
      heap[b >> 2] = 0;
      heap[r >> 2] = box.right;
      heap[t >> 2] = 0;
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
  it("measureObjRightEdgePt allocates one block per call", () => {
    const stub = stubModule(new Map([[7, { left: 1, right: 42 }]]));
    expect(measureObjRightEdgePt(stub.module, 7)).toBe(42);
    expect(stub.mallocs()).toBe(1);
    expect(stub.frees()).toBe(1);
  });

  it("measureObjSpanPt reuses one block across every pointer", () => {
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
    expect(stub.mallocs()).toBe(1);
    expect(stub.frees()).toBe(1);
  });

  it("measureObjRightEdgePt reports 0 for an unreadable object", () => {
    const stub = stubModule(new Map());
    expect(measureObjRightEdgePt(stub.module, 9)).toBe(0);
    expect(stub.mallocs()).toBe(1);
    expect(stub.frees()).toBe(1);
  });

  it("measureObjSpanPt returns null when nothing is measurable", () => {
    const stub = stubModule(new Map());
    expect(measureObjSpanPt(stub.module, [1, 2])).toBeNull();
    expect(stub.mallocs()).toBe(1);
    expect(stub.frees()).toBe(1);
  });
});
