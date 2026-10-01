import { describe, expect, it } from "vitest";
import { computeReadAloudHighlightRect } from "@app/components/viewer/readAloudHighlight";

describe("computeReadAloudHighlightRect", () => {
  it("returns page-relative coordinates for an unrotated text item", () => {
    expect(
      computeReadAloudHighlightRect({
        viewportTransform: [2, 0, 0, -2, 0, 1000],
        textTransform: [1, 0, 0, 1, 120, 300],
        itemWidth: 40,
        itemHeight: 10,
      }),
    ).toEqual({
      left: 240,
      top: 380,
      width: 80,
      height: 20,
    });
  });

  it("enforces minimum visible highlight dimensions", () => {
    expect(
      computeReadAloudHighlightRect({
        viewportTransform: [1, 0, 0, -1, 0, 600],
        textTransform: [1, 0, 0, 1, 12, 40],
        itemWidth: 2,
        itemHeight: 4,
      }),
    ).toEqual({
      left: 12,
      top: 548,
      width: 8,
      height: 12,
    });
  });

  it("returns null for invalid geometry", () => {
    expect(
      computeReadAloudHighlightRect({
        viewportTransform: [1, 0, 0, -1, 0, 600],
        textTransform: [1, 0, 0, 1, 0, 0],
        itemWidth: 10,
        itemHeight: 0,
      }),
    ).toBeNull();
  });

  it("returns the correct box for a 90 degree rotated viewport", () => {
    expect(
      computeReadAloudHighlightRect({
        viewportTransform: [0, 2, 2, 0, 0, 0],
        textTransform: [1, 0, 0, 1, 120, 300],
        itemWidth: 40,
        itemHeight: 10,
      }),
    ).toEqual({
      left: 600,
      top: 220,
      width: 80,
      height: 20,
    });
  });
});
