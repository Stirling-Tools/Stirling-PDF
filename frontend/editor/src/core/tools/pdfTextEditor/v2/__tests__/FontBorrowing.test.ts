import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for which font the emit path is allowed to borrow.
 *
 * Two reported corruptions came from here:
 *  - edited body text came back BOLD, because the borrow took the first glyph
 *    in content order and headings come first;
 *  - a Type 3 document (Figma/Skia export) scrambled into overlapping glyphs,
 *    because a face PDFium cannot author was reused anyway.
 */

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave", () => ({
  PdfiumSave: { serialize: vi.fn(() => new Uint8Array([0, 1, 2, 3])) },
}));

import {
  findFontForChar,
  fontIsReusable,
  fontStyleClass,
  styleClassFromName,
  _clearFontForCharCacheForTests,
  _clearReusableFontCacheForTests,
} from "@app/tools/pdfTextEditor/v2/charcode/BackendResolver";
import type { ResolverContext } from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";

const TEXT_PAGE = 555;

interface FakeFont {
  /** /BaseFont name; null models a Type 3 font, which has none. */
  name: string | null;
  /** Byte length PDFium reports for the font program; 0 for Type 3. */
  dataLen: number;
}

/**
 * Fake PDFium module rendering `glyphs` in page order, each with its own font.
 * `fonts` maps a font handle to what PDFium would report about it.
 */
function makeModule(
  glyphs: Array<[string, number]>,
  fonts: Record<number, FakeFont>,
): ResolverContext["module"] {
  const heap = new Map<number, number>();
  let nextPtr = 1;
  const strings = new Map<number, string>();
  return {
    FPDFText_LoadPage: vi.fn(() => TEXT_PAGE),
    FPDFText_ClosePage: vi.fn(),
    FPDFText_CountChars: vi.fn(() => glyphs.length),
    FPDFText_GetUnicode: vi.fn(
      (_tp: number, i: number) => glyphs[i][0].codePointAt(0) ?? 0,
    ),
    FPDFText_GetTextObject: vi.fn((_tp: number, i: number) => 1000 + i),
    FPDFTextObj_GetFont: vi.fn((obj: number) => glyphs[obj - 1000][1]),
    FPDFFont_GetBaseFontName: vi.fn(
      (font: number, buf: number, len: number) => {
        const name = fonts[font]?.name;
        if (!name) return 0;
        if (buf === 0 || len === 0) return name.length + 1;
        strings.set(buf, name);
        return name.length + 1;
      },
    ),
    FPDFFont_GetFontData: vi.fn(
      (font: number, _buf: number, _len: number, out: number) => {
        heap.set(out, fonts[font]?.dataLen ?? 0);
        return true;
      },
    ),
    pdfium: {
      wasmExports: {
        malloc: vi.fn(() => nextPtr++),
        free: vi.fn(),
      },
      getValue: vi.fn((ptr: number) => heap.get(ptr) ?? 0),
      setValue: vi.fn((ptr: number, v: number) => heap.set(ptr, v)),
      UTF8ToString: vi.fn((ptr: number) => strings.get(ptr) ?? ""),
    },
  } as unknown as ResolverContext["module"];
}

const ctxFor = (module: ResolverContext["module"]): ResolverContext => ({
  module,
  pagePtr: 42,
  docPtr: 1,
});

afterEach(() => {
  _clearFontForCharCacheForTests();
  _clearReusableFontCacheForTests();
});

const BOLD = 10;
const REGULAR = 20;
const TYPE3 = 30;

const REAL_FONTS: Record<number, FakeFont> = {
  [BOLD]: { name: "AAAAAB+Helvetica-Bold", dataLen: 4096 },
  [REGULAR]: { name: "AAAAAC+Helvetica", dataLen: 4096 },
};

describe("fontStyleClass", () => {
  it("reads bold and italic off the /BaseFont name", () => {
    const m = makeModule([], REAL_FONTS);
    expect(fontStyleClass(m, BOLD)).toEqual({ bold: true, italic: false });
    expect(fontStyleClass(m, REGULAR)).toEqual({ bold: false, italic: false });
  });

  it("returns null for a font with no name", () => {
    const m = makeModule([], { [TYPE3]: { name: null, dataLen: 0 } });
    expect(fontStyleClass(m, TYPE3)).toBeNull();
  });
});

describe("fontIsReusable", () => {
  it("accepts a font that reports a font program", () => {
    const m = makeModule([], REAL_FONTS);
    expect(fontIsReusable(m, REGULAR)).toBe(true);
  });

  it("rejects a Type 3 font, which reports a zero-length program", () => {
    // PDFium answers "true" for a Type 3 font but with length 0 - the length is
    // the part that distinguishes a real face.
    const m = makeModule([], { [TYPE3]: { name: "T3", dataLen: 0 } });
    expect(fontIsReusable(m, TYPE3)).toBe(false);
  });
});

describe("findFontForChar", () => {
  it("borrows the first matching glyph when no style is requested", () => {
    // 'o' appears first in the bold heading, then in the regular body.
    const m = makeModule(
      [
        ["o", BOLD],
        ["o", REGULAR],
      ],
      REAL_FONTS,
    );
    expect(findFontForChar("o", ctxFor(m))).toBe(BOLD);
  });

  it("skips the bold heading when the run's own font is regular", () => {
    const m = makeModule(
      [
        ["o", BOLD],
        ["o", REGULAR],
      ],
      REAL_FONTS,
    );
    // This is the fake-bold regression: without the style constraint the body
    // run's re-emitted "o" came back in Helvetica-Bold.
    expect(findFontForChar("o", ctxFor(m), REGULAR)).toBe(REGULAR);
  });

  it("skips the regular body when the run's own font is bold", () => {
    const m = makeModule(
      [
        ["o", REGULAR],
        ["o", BOLD],
      ],
      REAL_FONTS,
    );
    expect(findFontForChar("o", ctxFor(m), BOLD)).toBe(BOLD);
  });

  it("returns null rather than change weight when only the wrong weight has the glyph", () => {
    const m = makeModule([["o", BOLD]], REAL_FONTS);
    // Falling back to a substituted regular face is correct; silently going
    // bold is not.
    expect(findFontForChar("o", ctxFor(m), REGULAR)).toBeNull();
  });

  it("honours an explicit style when there is no source font handle", () => {
    // The undo path re-emits with `originalFontPtr: 0`. Keying the guard only
    // off the handle disabled it there, and restored body text came back bold
    // for every letter whose first page-order occurrence was in a heading.
    const m = makeModule(
      [
        ["p", BOLD],
        ["p", REGULAR],
      ],
      REAL_FONTS,
    );
    expect(
      findFontForChar("p", ctxFor(m), 0, styleClassFromName("Times-Roman")),
    ).toBe(REGULAR);
    expect(
      findFontForChar("p", ctxFor(m), 0, styleClassFromName("Times-Bold")),
    ).toBe(BOLD);
  });

  it("still offers a Type 3 face - the emit path gates it on a measurable advance", () => {
    // Refusing Type 3 outright would lose glyph reuse for an append into a
    // Type 3 run, which renders perfectly. The emit path takes the face only
    // when it can also measure the glyph's advance off the page.
    const m = makeModule([["o", TYPE3]], {
      [TYPE3]: { name: null, dataLen: 0 },
    });
    expect(findFontForChar("o", ctxFor(m))).toBe(TYPE3);
    expect(fontIsReusable(m, TYPE3)).toBe(false);
  });
});
