// @vitest-environment node
import { expect, test, vi } from "vitest";
import type { ResolverContext } from "@editor/tools/pdfTextEditor/charcode/CharcodeStrategy";

const FONT_NAMES: Record<number, string> = {
  1: "ABCDEF+Body",
  2: "GHIJKL+Body",
  3: "MNOPQR+Body",
};
const DRAWS: Record<number, string> = { 1: "a", 2: "b", 3: "c" };

vi.mock("@editor/tools/pdfTextEditor/charcode/FontHelpers", () => ({
  readFontName: (_m: unknown, font: number) => FONT_NAMES[font],
}));
vi.mock("@editor/tools/pdfTextEditor/charcode/charcodeRegistry", () => ({
  tryResolveCharcodes: (font: number, ch: string) =>
    DRAWS[font] === ch
      ? { result: { coverage: 1, charcodes: [ch.charCodeAt(0)] } }
      : null,
}));

const { sameFaceFontForChar, sameFaceFontsForChar } =
  await import("@editor/tools/pdfTextEditor/charcode/sameFaceFonts");

function pageDrawing(fonts: number[]): ResolverContext {
  const module = {
    FPDFPage_CountObjects: () => fonts.length,
    FPDFPage_GetObject: (_page: number, index: number) => 100 + index,
    FPDFPageObj_GetType: () => 1,
    FPDFTextObj_GetFont: (obj: number) => fonts[obj - 100],
  };
  return {
    module: module as unknown as ResolverContext["module"],
    pagePtr: 7,
    docPtr: 1,
  };
}

test("finds a sibling font that replaced another without changing the object count", () => {
  const fonts = [1, 2];
  const ctx = pageDrawing(fonts);
  expect(sameFaceFontForChar("b", 1, ctx)).toBe(2);
  fonts[1] = 3;
  expect(sameFaceFontForChar("c", 1, ctx)).toBe(3);
  expect(sameFaceFontsForChar("c", 1, ctx)).toEqual([3]);
});
