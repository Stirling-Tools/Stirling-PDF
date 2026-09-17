import { describe, expect, it } from "vitest";
import {
  analyzeTextDirection,
  baseDirectionForText,
  isSimpleLtrText,
  restoreLogicalTextFromVisualOrder,
} from "@app/tools/pdfTextEditor/util/textDirection";

function visualText(text: string): string {
  return analyzeTextDirection(text)
    .visualGlyphs.map((glyph) => glyph.renderedText)
    .join("");
}

describe("PDF text direction planning", () => {
  it("keeps plain Latin text on the simple LTR path", () => {
    expect(isSimpleLtrText("English 123")).toBe(true);
    expect(visualText("English 123")).toBe("English 123");
  });

  it("reorders Hebrew without reversing the logical model", () => {
    const text = "שלום";
    const info = analyzeTextDirection(text);
    expect(info.kind).toBe("rtl");
    expect(info.baseDirection).toBe("rtl");
    expect(visualText(text)).toBe("םולש");
    expect(
      [...info.visualGlyphs]
        .sort((a, b) => a.logicalStart - b.logicalStart)
        .map((glyph) => glyph.logicalText)
        .join(""),
    ).toBe(text);
  });

  it("handles both mixed-direction base orders", () => {
    expect(baseDirectionForText("English שלום")).toBe("ltr");
    expect(baseDirectionForText("שלום English")).toBe("rtl");
    expect(visualText("English שלום")).toBe("English םולש");
    expect(visualText("שלום English")).toBe("English םולש");
  });

  it("keeps digits in their LTR run and mirrors RTL brackets", () => {
    const info = analyzeTextDirection("שלום (אבג) 123");
    expect(info.kind).toBe("mixed");
    expect(visualText("שלום (אבג) 123")).toBe("123 (גבא) םולש");
    expect(info.visualGlyphs.map((glyph) => glyph.logicalStart)).toEqual(
      expect.arrayContaining([0, 5, 9, 11]),
    );
  });

  it("restores the logical string carried by visual glyph objects", () => {
    expect(restoreLogicalTextFromVisualOrder("123 )גבא( םולש")).toBe(
      "שלום (אבג) 123",
    );
  });
});
