import { describe, expect, it } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  _clearSymbolicFontCacheForTests,
  fontIsSymbolic,
} from "@app/tools/pdfTextEditor/charcode/BackendResolver";

function moduleWithFlags(flagsByPtr: Map<number, number>) {
  return {
    FPDFFont_GetFlags: (font: number): number => flagsByPtr.get(font) ?? 0,
  } as unknown as WrappedPdfiumModule;
}

describe("fontIsSymbolic", () => {
  it("flags symbolic fonts and spares nonsymbolic declarations", () => {
    _clearSymbolicFontCacheForTests();
    const m = moduleWithFlags(
      new Map([
        [1, 0x4], // SYMBOLIC only
        [2, 0x20], // NON_SYMBOLIC only
        [3, 0x4 | 0x20], // both set: nonsymbolic wins
        [4, 0], // plain TrueType
      ]),
    );
    expect(fontIsSymbolic(m, 1)).toBe(true);
    expect(fontIsSymbolic(m, 2)).toBe(false);
    expect(fontIsSymbolic(m, 3)).toBe(false);
    expect(fontIsSymbolic(m, 4)).toBe(false);
    expect(fontIsSymbolic(m, 0)).toBe(false);
  });

  it("assumes a normal encoding when the API is absent", () => {
    _clearSymbolicFontCacheForTests();
    expect(fontIsSymbolic({} as unknown as WrappedPdfiumModule, 9)).toBe(false);
  });
});
