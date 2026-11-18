import { beforeEach, describe, expect, it } from "vitest";
import {
  ToUnicodeResolver,
  _clearToUnicodeCacheForTests,
  trueTypeGlyphCount,
} from "@editor/tools/pdfTextEditor/charcode/ToUnicodeResolver";
import type { ResolverContext } from "@editor/tools/pdfTextEditor/charcode/CharcodeStrategy";

// ToUnicode of a "Yeseva One" subset from a Chrome-printed PDF. Numbering
// characters in page order, as the content-stream strategy does, gives a page
// starting "Quotation" Q=1 u=2 o=3 t=4, and this font draws code 4 as "A".
const YESEVA_TOUNICODE: Record<number, string> = {
  3: " ",
  4: "A",
  15: "D",
  17: "E",
  24: "H",
  34: "M",
  35: "N",
  45: "P",
  48: "R",
  49: "S",
  50: "T",
  57: "W",
  62: "a",
  70: "b",
  71: "c",
  73: "d",
  75: "e",
  80: "f",
  81: "g",
  82: "h",
  83: "i",
  91: "k",
  92: "l",
  94: "m",
  95: "n",
  97: "o",
  105: "p",
  108: "r",
  109: "s",
  111: "t",
  112: "u",
  117: "v",
  118: "w",
  119: "x",
  120: "y",
};

const FONT = 77;
const PAGE = 5;
const DOC = 9;

interface FakeOptions {
  /** code -> decoded string (several chars = ligature). */
  toUnicode: Record<number, string>;
  /** Codes this font truncates (single-byte fonts): code -> effective code. */
  truncate?: (code: number) => number;
  /** PDFium behaviour for codes without a ToUnicode entry: decode as the code itself. */
  identityFallback?: boolean;
}

function makeModule(opts: FakeOptions) {
  const heap = new Uint8Array(1024);
  let nextObj = 1000;
  const codeOf = new Map<number, number>();
  const onPage: number[] = [];
  const destroyed = new Set<number>();
  let textPageLoads = 0;
  let textPageChars: Array<{ obj: number; unicode: number }> = [];
  const m = {
    pdfium: {
      HEAPU8: heap,
      wasmExports: {
        malloc: () => 16,
        free: () => {},
      },
    },
    FPDFPageObj_CreateTextObj: (doc: number, font: number) =>
      doc === DOC && font === FONT ? nextObj++ : 0,
    FPDFText_SetCharcodes: (obj: number, ptr: number, count: number) => {
      if (count !== 1) return false;
      const code = new Uint32Array(heap.buffer, ptr, 1)[0];
      codeOf.set(obj, opts.truncate ? opts.truncate(code) : code);
      return true;
    },
    FPDFPageObj_Transform: () => {},
    FPDFPage_InsertObject: (page: number, obj: number) => {
      if (page === PAGE) onPage.push(obj);
    },
    FPDFPage_RemoveObject: (page: number, obj: number) => {
      const i = onPage.indexOf(obj);
      if (page !== PAGE || i < 0) return false;
      onPage.splice(i, 1);
      return true;
    },
    FPDFPageObj_Destroy: (obj: number) => {
      destroyed.add(obj);
    },
    FPDFText_LoadPage: (page: number) => {
      if (page !== PAGE) return 0;
      textPageLoads++;
      textPageChars = [];
      for (const obj of onPage) {
        const code = codeOf.get(obj) ?? -1;
        const text =
          opts.toUnicode[code] ??
          (opts.identityFallback && code >= 0
            ? String.fromCodePoint(code)
            : undefined);
        // Unmapped codes decode to nothing; ligatures to several characters.
        for (const ch of text ?? "") {
          textPageChars.push({ obj, unicode: ch.codePointAt(0)! });
        }
      }
      return 1;
    },
    FPDFText_ClosePage: () => {},
    FPDFText_CountChars: () => textPageChars.length,
    FPDFText_GetUnicode: (_tp: number, i: number) =>
      textPageChars[i]?.unicode ?? 0,
    FPDFText_GetTextObject: (_tp: number, i: number) =>
      textPageChars[i]?.obj ?? 0,
  };
  return {
    m,
    onPage,
    destroyed,
    created: () => nextObj - 1000,
    textPageLoads: () => textPageLoads,
  };
}

function ctxFor(m: unknown): ResolverContext {
  return { module: m as ResolverContext["module"], pagePtr: PAGE, docPtr: DOC };
}

describe("ToUnicodeResolver", () => {
  beforeEach(() => _clearToUnicodeCacheForTests());

  it("resolves the real charcode for a character the font carries", () => {
    const fake = makeModule({ toUnicode: YESEVA_TOUNICODE });
    const r = new ToUnicodeResolver().resolve(
      FONT,
      "Adventure",
      ctxFor(fake.m),
    );
    expect(r?.missing).toEqual([]);
    expect(r?.charcodes).toEqual([4, 73, 117, 75, 95, 111, 112, 108, 75]);
  });

  it("reports characters the subset does not carry instead of inventing a code", () => {
    const fake = makeModule({ toUnicode: YESEVA_TOUNICODE });
    const r = new ToUnicodeResolver().resolve(FONT, "Quz", ctxFor(fake.m));
    expect(r?.missing).toEqual(["Q", "z"]);
    expect(r?.charcodes).toEqual([112]);
    expect(r?.coverage).toBe(1);
  });

  it("removes and frees every probe object", () => {
    const fake = makeModule({ toUnicode: YESEVA_TOUNICODE });
    new ToUnicodeResolver().resolve(FONT, "Desk", ctxFor(fake.m));
    expect(fake.onPage).toEqual([]);
    expect(fake.destroyed.size).toBe(fake.created());
  });

  it("caches per font and stops probing once the text is covered", () => {
    const fake = makeModule({ toUnicode: YESEVA_TOUNICODE });
    const resolver = new ToUnicodeResolver();
    resolver.resolve(FONT, "AD", ctxFor(fake.m));
    const loads = fake.textPageLoads();
    // One pass for the fallback check, one batch: codes 4 and 15 are both in it.
    expect(loads).toBe(2);
    resolver.resolve(FONT, "Desk", ctxFor(fake.m));
    expect(fake.textPageLoads()).toBe(loads); // already known, no new probe
  });

  it("ignores codes that decode to several characters (ligatures)", () => {
    const fake = makeModule({ toUnicode: { 5: "fi", 6: "f", 7: "i" } });
    const r = new ToUnicodeResolver().resolve(FONT, "fi", ctxFor(fake.m));
    expect(r?.charcodes).toEqual([6, 7]);
  });

  it("keeps the lowest code when a single-byte font repeats codes", () => {
    const fake = makeModule({
      toUnicode: { 65: "A" },
      truncate: (code) => code & 0xff,
    });
    const r = new ToUnicodeResolver().resolve(FONT, "A", ctxFor(fake.m));
    expect(r?.charcodes).toEqual([65]);
  });

  it("ignores PDFium's code-number fallback for codes the font doesn't map", () => {
    // Real PDFium reads code 66 back as "B" when ToUnicode has no entry for it;
    // this subset has no "B", so typing one must report it missing, not draw
    // whatever glyph 66 is.
    const fake = makeModule({
      toUnicode: YESEVA_TOUNICODE,
      identityFallback: true,
    });
    const r = new ToUnicodeResolver().resolve(FONT, "Bt", ctxFor(fake.m));
    expect(r?.missing).toEqual(["B"]);
    expect(r?.charcodes).toEqual([111]);
  });

  it("keeps code == character mappings for fonts without that fallback", () => {
    // Single-byte WinAnsi fonts really do map code 65 to "A".
    const fake = makeModule({ toUnicode: { 65: "A", 66: "B" } });
    const r = new ToUnicodeResolver().resolve(FONT, "AB", ctxFor(fake.m));
    expect(r?.charcodes).toEqual([65, 66]);
  });

  it("returns null when the module cannot probe", () => {
    const r = new ToUnicodeResolver().resolve(
      FONT,
      "A",
      ctxFor({ pdfium: { wasmExports: {} } }),
    );
    expect(r).toBeNull();
  });
});

describe("trueTypeGlyphCount", () => {
  function fontWithMaxp(numGlyphs: number): Uint8Array {
    const bytes = new Uint8Array(12 + 16 + 6);
    const dv = new DataView(bytes.buffer);
    dv.setUint16(4, 1); // numTables
    bytes.set([0x6d, 0x61, 0x78, 0x70], 12); // "maxp"
    dv.setUint32(12 + 8, 28); // offset
    dv.setUint16(28 + 4, numGlyphs);
    return bytes;
  }

  it("reads numGlyphs from maxp", () => {
    expect(trueTypeGlyphCount(fontWithMaxp(121))).toBe(121);
  });

  it("returns null without a usable font program", () => {
    expect(trueTypeGlyphCount(null)).toBeNull();
    expect(trueTypeGlyphCount(new Uint8Array(8))).toBeNull();
  });
});
