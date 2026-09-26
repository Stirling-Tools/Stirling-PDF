import { describe, expect, it } from "vitest";
import {
  readAloudViewportTransform,
  sortReadAloudItems,
  type ReadAloudTextItem,
} from "@app/services/pdfiumService";

function word(
  str: string,
  left: number,
  bottom: number,
  height = 10,
): ReadAloudTextItem {
  return {
    str,
    transform: [1, 0, 0, 1, left, bottom],
    width: 20,
    height,
    viewportTransform: [1, 0, 0, -1, 0, 600],
  };
}

describe("readAloudViewportTransform", () => {
  it("matches the unrotated pdf.js viewport", () => {
    expect(readAloudViewportTransform(0, 600, 800, 2)).toEqual([
      2, 0, 0, -2, 0, 1600,
    ]);
  });

  it("rotates 90 degrees clockwise", () => {
    expect(readAloudViewportTransform(1, 600, 800, 2)).toEqual([
      0, 2, 2, 0, 0, 0,
    ]);
  });

  it("rotates 180 degrees", () => {
    expect(readAloudViewportTransform(2, 600, 800, 2)).toEqual([
      -2, 0, 0, 2, 1200, 0,
    ]);
  });

  it("rotates 270 degrees clockwise", () => {
    expect(readAloudViewportTransform(3, 600, 800, 2)).toEqual([
      0, -2, -2, 0, 1600, 1200,
    ]);
  });

  it("masks quarters to two bits", () => {
    expect(readAloudViewportTransform(4, 600, 800, 2)).toEqual(
      readAloudViewportTransform(0, 600, 800, 2),
    );
  });
});

describe("sortReadAloudItems", () => {
  it("reads top-to-bottom, left-to-right", () => {
    const items = [word("bottom", 10, 50), word("top", 10, 200)];
    expect(sortReadAloudItems(items).map((item) => item.str)).toEqual([
      "top",
      "bottom",
    ]);
  });

  it("keeps visual order for two columns despite enumeration order", () => {
    const items = [
      word("right-col", 300, 200),
      word("left-col", 50, 200),
      word("next-line", 50, 150),
    ];
    expect(sortReadAloudItems(items).map((item) => item.str)).toEqual([
      "left-col",
      "right-col",
      "next-line",
    ]);
  });

  it("treats a 3px vertical drift as the same line", () => {
    const items = [word("second", 200, 197), word("first", 50, 200)];
    expect(sortReadAloudItems(items).map((item) => item.str)).toEqual([
      "first",
      "second",
    ]);
  });

  it("does not mutate the input array", () => {
    const items = [word("b", 10, 50), word("a", 10, 200)];
    sortReadAloudItems(items);
    expect(items.map((item) => item.str)).toEqual(["b", "a"]);
  });

  it("reads a 90-degree rotated page from its visual top", () => {
    // 90° clockwise: x' = y, y' = x, so the PDF-leftmost word is on top.
    const rotated = (str: string, left: number, bottom: number) => ({
      ...word(str, left, bottom),
      viewportTransform: [0, 1, 1, 0, 0, 0],
    });
    const items = [rotated("right", 300, 100), rotated("left", 50, 100)];
    expect(sortReadAloudItems(items).map((item) => item.str)).toEqual([
      "left",
      "right",
    ]);
  });
});
