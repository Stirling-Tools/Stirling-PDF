import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  fallbackFamilyFor,
  fallbackFontIdFor,
  styleCapability,
} from "@editor/tools/pdfTextEditor/util/fontCapability";
import { canRestyle } from "@editor/tools/pdfTextEditor/util/fontFaces";
import {
  resetFontCompletions,
  resolveOriginalFonts,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import {
  listLocalFonts,
  resetLocalFontsCache,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { LocalFont } from "@editor/tools/pdfTextEditor/util/localFonts";
import { assembleSfnt } from "@editor/tools/pdfTextEditor/util/sfnt";

// The editor used to answer "make this italic" for ANY font by swapping the run
// wholesale to Helvetica-Oblique. For a document set in Calibri that is not
// italic, it is losing the typeface - and it happened silently, because the
// toolbar had no way to say the change was impossible.
//
// The same blind spot cost subset-embedded runs their face on every edit:
// helveticaVariantFor threw the family name away, so the device-font emit path
// (which needs the real family) could never fire, even with the face installed.

const CALIBRI: LocalFont[] = [
  {
    family: "Calibri",
    fullName: "Calibri",
    style: "Regular",
    postscriptName: "Calibri",
  },
  {
    family: "Calibri",
    fullName: "Calibri Italic",
    style: "Italic",
    postscriptName: "Calibri-Italic",
  },
];

// PDFium gives no name or program for these fonts, so only the family in the font id is left.
const NO_FONT_DATA = {} as WrappedPdfiumModule;

/** An installed family with no italic cut at all. */
const STENCIL: LocalFont[] = [
  {
    family: "Stencil",
    fullName: "Stencil",
    style: "Regular",
    postscriptName: "Stencil",
  },
];

function stubQueryLocalFonts(fonts: LocalFont[] | null): void {
  const w = window as unknown as { queryLocalFonts?: unknown };
  if (fonts === null) {
    delete w.queryLocalFonts;
    return;
  }
  w.queryLocalFonts = vi.fn(async () =>
    fonts.map((font) => ({
      ...font,
      blob: async () => ({
        arrayBuffer: async () =>
          assembleSfnt(0x00010000, new Map([["glyf", new Uint8Array(4)]]))
            .buffer,
      }),
    })),
  );
}

beforeEach(() => {
  resetLocalFontsCache();
  resetFontCompletions();
  stubQueryLocalFonts(null);
});

describe("styleCapability for italic", () => {
  it("flips a base-14 family in place", () => {
    expect(
      styleCapability(
        "base14:Helvetica",
        { italic: true },
        { documentFamilies: [], externalFonts: null },
      ),
    ).toEqual({
      family: "Helvetica-Oblique",
      source: "base14",
    });
    expect(
      styleCapability(
        "base14:Times-BoldItalic",
        { italic: false },
        { documentFamilies: [], externalFonts: null },
      ),
    ).toEqual({
      family: "Times-Bold",
      source: "base14",
    });
  });

  it("refuses an embedded family with no device fonts loaded", () => {
    expect(
      styleCapability(
        "pdf:4242:Calibri",
        { italic: true },
        { documentFamilies: [], externalFonts: null },
      ).family,
    ).toBeNull();
  });

  it("refuses a subset family whose installed face has no italic cut", () => {
    expect(
      styleCapability(
        "pdf:4242:Stencil",
        { italic: true },
        { documentFamilies: [], externalFonts: STENCIL },
      ).family,
    ).toBeNull();
  });

  it("uses the installed italic cut of the run's own family", () => {
    expect(
      styleCapability(
        "pdf:4242:Calibri",
        { italic: true },
        { documentFamilies: [], externalFonts: CALIBRI },
      ),
    ).toEqual({
      family: "Calibri Italic",
      source: "device",
    });
  });

  it("never substitutes a different typeface", () => {
    // The whole point: Calibri does not become Helvetica just to look slanted.
    const cap = styleCapability(
      "pdf:4242:Calibri",
      { italic: true },
      { documentFamilies: [], externalFonts: STENCIL },
    );
    expect(cap.family).toBeNull();
    expect(cap.source).toBeNull();
  });
});

describe("styleCapability answers", () => {
  it("are read from the font list asked with, so a new list is asked afresh", () => {
    const before = styleCapability(
      "pdf:4242:Calibri",
      { italic: true },
      { documentFamilies: [], externalFonts: STENCIL },
    );
    expect(before.family).toBeNull();
    expect(
      styleCapability(
        "pdf:4242:Calibri",
        { italic: true },
        { documentFamilies: [], externalFonts: STENCIL },
      ),
    ).toEqual(before);
    const found = styleCapability(
      "pdf:4242:Calibri",
      { italic: true },
      { documentFamilies: [], externalFonts: CALIBRI },
    );
    expect(found.family).toBe("Calibri Italic");
    expect(
      styleCapability(
        "pdf:4242:Calibri",
        { italic: true },
        { documentFamilies: [], externalFonts: CALIBRI },
      ),
    ).toEqual(found);
  });
});

describe("canRestyle to italic", () => {
  it("is false for an empty selection", () => {
    expect(
      canRestyle(
        [],
        { italic: true },
        { documentFamilies: [], externalFonts: CALIBRI },
      ),
    ).toBe(false);
  });

  it("needs EVERY run to be capable", () => {
    expect(
      canRestyle(
        ["base14:Helvetica", "base14:Times-Roman"],
        { italic: true },
        { documentFamilies: [], externalFonts: null },
      ),
    ).toBe(true);
    expect(
      canRestyle(
        ["base14:Helvetica", "pdf:1:Stencil"],
        { italic: true },
        { documentFamilies: [], externalFonts: STENCIL },
      ),
    ).toBe(false);
  });
});

describe("fallbackFamilyFor", () => {
  it("falls back to Helvetica when the family is not installed", () => {
    expect(fallbackFamilyFor("pdf:4242:Calibri")).toBe("Helvetica");
    expect(fallbackFontIdFor("Helvetica")).toBe("base14:Helvetica");
  });

  it("keeps a subset family whose real face is loaded", async () => {
    stubQueryLocalFonts(CALIBRI);
    await listLocalFonts();
    await resolveOriginalFonts(NO_FONT_DATA, ["pdf:4242:Calibri"], () => true);

    // Completing the subset now costs the document nothing: the edit re-emits
    // in Calibri's real bytes rather than Helvetica.
    expect(fallbackFamilyFor("pdf:4242:Calibri")).toBe("Calibri");
    expect(fallbackFontIdFor("Calibri")).toBe("device:Calibri");
  });

  it("does not forget the face on the NEXT edit", async () => {
    stubQueryLocalFonts(CALIBRI);
    await listLocalFonts();
    await resolveOriginalFonts(NO_FONT_DATA, ["pdf:4242:Calibri"], () => true);

    // The id an edit leaves behind must still resolve to the same real family.
    const nextId = fallbackFontIdFor(fallbackFamilyFor("pdf:4242:Calibri"));
    expect(fallbackFamilyFor(nextId)).toBe("Calibri");
  });
});
