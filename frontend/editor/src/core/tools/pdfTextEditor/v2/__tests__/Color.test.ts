import { describe, expect, it } from "vitest";
import {
  BLACK,
  WHITE,
  equalsRGBA,
  parseCssColor,
  toCssHex,
} from "@app/tools/pdfTextEditor/v2/model/Color";

describe("Color", () => {
  it("parses #rrggbb", () => {
    expect(parseCssColor("#ff8800")).toEqual({ r: 255, g: 136, b: 0, a: 255 });
  });

  it("parses #rrggbbaa", () => {
    expect(parseCssColor("#11223380")).toEqual({
      r: 17,
      g: 34,
      b: 51,
      a: 128,
    });
  });

  it("parses rgb(...)", () => {
    expect(parseCssColor("rgb(10, 20, 30)")).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 255,
    });
  });

  it("parses rgba(...) with fractional alpha", () => {
    expect(parseCssColor("rgba(10, 20, 30, 0.5)")).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 128,
    });
  });

  it("returns null for invalid input", () => {
    expect(parseCssColor("not a colour")).toBeNull();
    expect(parseCssColor("#abc")).toBeNull(); // short hex unsupported on purpose
  });

  it("round-trips through toCssHex", () => {
    const rgba = parseCssColor("#abcdef")!;
    expect(toCssHex(rgba)).toBe("#abcdef");
  });

  it("clamps and rounds when serialising", () => {
    expect(toCssHex({ r: -10, g: 300, b: 0.5, a: 255 })).toBe("#00ff01");
  });

  it("equalsRGBA respects every component", () => {
    expect(equalsRGBA(BLACK, BLACK)).toBe(true);
    expect(equalsRGBA(BLACK, WHITE)).toBe(false);
    expect(
      equalsRGBA({ r: 1, g: 2, b: 3, a: 4 }, { r: 1, g: 2, b: 3, a: 5 }),
    ).toBe(false);
  });
});
