import { describe, it, expect } from "vitest";
import {
  flipBold,
  flipItalic,
} from "@app/tools/pdfTextEditor/v2/util/fontFamily";

/**
 * The base-14 combined styles have EXACT PostScript spellings (Times uses
 * Roman/Italic/BoldItalic; Helvetica/Courier use Oblique/BoldOblique). The old
 * implementation string-spliced "-Bold" onto "-Italic"/"-Oblique", producing
 * non-existent names (e.g. "Times-Italic-Bold", "Helvetica-Oblique-Bold") that
 * a viewer silently substitutes - a font flip. These pin the correct names.
 */
describe("fontFamily base-14 style flips", () => {
  it("bold-on preserves italic with the canonical combined name", () => {
    expect(flipBold("Times-Italic", true)).toBe("Times-BoldItalic");
    expect(flipBold("Helvetica-Oblique", true)).toBe("Helvetica-BoldOblique");
    expect(flipBold("Courier-Oblique", true)).toBe("Courier-BoldOblique");
  });

  it("italic-on preserves bold with the canonical combined name", () => {
    expect(flipItalic("Times-Bold", true)).toBe("Times-BoldItalic");
    expect(flipItalic("Helvetica-Bold", true)).toBe("Helvetica-BoldOblique");
    // Courier italic was previously unrepresentable (returned null).
    expect(flipItalic("Courier", true)).toBe("Courier-Oblique");
    expect(flipItalic("Courier-Bold", true)).toBe("Courier-BoldOblique");
  });

  it("turning a style off returns the correct base / single-style name", () => {
    expect(flipBold("Times-BoldItalic", false)).toBe("Times-Italic");
    expect(flipItalic("Times-BoldItalic", false)).toBe("Times-Bold");
    expect(flipBold("Helvetica-BoldOblique", false)).toBe("Helvetica-Oblique");
    expect(flipItalic("Helvetica-BoldOblique", false)).toBe("Helvetica-Bold");
    expect(flipBold("Helvetica-Bold", false)).toBe("Helvetica");
    expect(flipItalic("Times-Italic", false)).toBe("Times-Roman");
  });

  it("returns null for non-base-14 families", () => {
    expect(flipBold("LMRoman12", true)).toBeNull();
    expect(flipItalic("ABCDEF+CustomFont", true)).toBeNull();
  });
});
