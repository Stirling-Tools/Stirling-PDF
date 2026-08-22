import { describe, it, expect } from "vitest";
import {
  flipBold,
  flipItalic,
  nearestStandardFont,
} from "@app/tools/pdfTextEditor/v2/util/fontFamily";

// The base-14 combined styles have EXACT PostScript spellings (Times uses
// Roman/Italic/BoldItalic; Helvetica/Courier use Oblique/BoldOblique).
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

/** An unknown family must be substituted, not dropped along with the text. */
describe("nearestStandardFont", () => {
  it("passes a standard font through untouched", () => {
    expect(nearestStandardFont("Helvetica")).toBe("Helvetica");
    expect(nearestStandardFont("Times-BoldItalic")).toBe("Times-BoldItalic");
    expect(nearestStandardFont("Courier-Oblique")).toBe("Courier-Oblique");
  });

  it("maps a device sans-serif family onto Helvetica", () => {
    expect(nearestStandardFont("Segoe UI")).toBe("Helvetica");
    expect(nearestStandardFont("Arial")).toBe("Helvetica");
  });

  it("recognises serif and monospace families by name", () => {
    expect(nearestStandardFont("Georgia")).toBe("Times-Roman");
    expect(nearestStandardFont("Garamond")).toBe("Times-Roman");
    expect(nearestStandardFont("Consolas")).toBe("Courier");
    expect(nearestStandardFont("JetBrains Mono")).toBe("Courier");
  });

  it("carries weight and slant across the substitution", () => {
    expect(nearestStandardFont("Segoe UI Bold")).toBe("Helvetica-Bold");
    expect(nearestStandardFont("Georgia Bold Italic")).toBe("Times-BoldItalic");
    expect(nearestStandardFont("Consolas Italic")).toBe("Courier-Oblique");
    expect(nearestStandardFont("Inter SemiBold")).toBe("Helvetica-Bold");
  });
});
