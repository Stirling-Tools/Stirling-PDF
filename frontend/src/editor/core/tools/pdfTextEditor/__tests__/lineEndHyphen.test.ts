// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  drawnCodePoint,
  drawnText,
} from "@editor/tools/pdfTextEditor/pdfium/lineEndHyphen";

describe("PDFium line-end hyphen marker", () => {
  it("reads the marker as the hyphen that is drawn on the page", () => {
    expect(drawnText("posi\u0002\ntion")).toBe("posi-\ntion");
    expect(drawnCodePoint(0x0002)).toBe(0x2d);
  });

  it("leaves every other character alone", () => {
    expect(drawnText("well-known\tline\n")).toBe("well-known\tline\n");
    expect(drawnCodePoint(0x41)).toBe(0x41);
    expect(drawnCodePoint(0x2d)).toBe(0x2d);
  });

  it("reads a value that is no code point as U+FFFD", () => {
    expect(drawnCodePoint(0xe0e0e0)).toBe(0xfffd);
    expect(drawnCodePoint(-257382528)).toBe(0xfffd);
    expect(drawnCodePoint(0x10ffff)).toBe(0x10ffff);
  });
});
