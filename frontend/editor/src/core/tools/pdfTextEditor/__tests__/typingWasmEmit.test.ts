import { describe, expect, it } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { setCharcodesOn } from "@app/tools/pdfTextEditor/charcode/charcodeRegistry";
import {
  measureObjRightEdgePt,
  measureObjSpanPt,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";

// WASM emit profile for the per-keystroke text path. A stub module with a
// real bump allocator stands in for PDFium so malloc/free balance and
// geometry-measure cost are observable without a browser.
interface Counters {
  mallocs: number;
  frees: number;
}

function stubEmitModule(counters: Counters): WrappedPdfiumModule {
  const heap = new ArrayBuffer(1 << 20);
  const u8 = new Uint8Array(heap);
  const f32 = new Float32Array(heap);
  let next = 8;
  const mod: Record<string, unknown> = {
    pdfium: {
      HEAPU8: u8,
      wasmExports: {
        malloc: (n: number): number => {
          counters.mallocs += 1;
          const p = next;
          next += (n + 7) & ~7;
          return p;
        },
        free: (): void => {
          counters.frees += 1;
        },
      },
      getValue: (ptr: number, type: string): number =>
        type === "float" ? f32[ptr >> 2] : 0,
    },
    FPDFText_SetCharcodes: (): boolean => true,
    FPDFPageObj_GetBounds: (
      _ptr: number,
      l: number,
      _b: number,
      r: number,
      _t: number,
    ): number => {
      f32[l >> 2] = 1;
      f32[r >> 2] = 42;
      return 1;
    },
  };
  return mod as unknown as WrappedPdfiumModule;
}

describe("typing WASM emit profile", () => {
  it("allocates the SetCharcodes buffer once and reuses it", () => {
    const counters: Counters = { mallocs: 0, frees: 0 };
    const m = stubEmitModule(counters);
    expect(setCharcodesOn(m, 11, [65, 66, 67])).toBe(true);
    expect(counters.mallocs).toBe(1);
    expect(setCharcodesOn(m, 11, [65, 66, 67])).toBe(true);
    expect(counters.mallocs).toBe(1);
    expect(counters.frees).toBe(0);
  });

  it("emits a 100-key burst with no allocator churn per key", () => {
    const counters: Counters = { mallocs: 0, frees: 0 };
    const m = stubEmitModule(counters);
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) {
      expect(setCharcodesOn(m, 11, [65 + (i % 26)])).toBe(true);
    }
    expect(performance.now() - t0).toBeLessThan(1000);
    // One pooled block for the whole burst.
    expect(counters.mallocs).toBe(1);
    expect(counters.frees).toBe(0);
  });

  it("measures per-keystroke geometry with one scratch block, fast", () => {
    const counters: Counters = { mallocs: 0, frees: 0 };
    const m = stubEmitModule(counters);
    const ptrs = Array.from({ length: 200 }, (_, i) => i + 1);
    const t0 = performance.now();
    for (let i = 0; i < 50; i += 1) {
      expect(measureObjSpanPt(m, ptrs)).toEqual({ left: 1, right: 42 });
    }
    expect(performance.now() - t0).toBeLessThan(1000);
    // One pooled block reused across all 50 calls.
    expect(counters.mallocs).toBe(1);
    expect(counters.frees).toBe(0);
  });

  it("reads a single object edge with one scratch block", () => {
    const counters: Counters = { mallocs: 0, frees: 0 };
    const m = stubEmitModule(counters);
    expect(measureObjRightEdgePt(m, 3)).toBe(42);
    expect(counters.mallocs).toBe(1);
    expect(counters.frees).toBe(0);
  });
});
