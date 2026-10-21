// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  clampPageRect,
  createFullPageRect,
  createInsetPageRect,
  displayRectToPage,
  getDisplaySize,
  getPageBox,
  isFullPageRect,
  normalizeRotation,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";

const upright: CropPageGeometry = {
  viewBox: [0, 0, 100, 200],
  rotation: 0,
};

const offsetUpright: CropPageGeometry = {
  viewBox: [50, 30, 250, 230],
  rotation: 0,
};

describe("getDisplaySize", () => {
  test("swaps extents for quarter turns", () => {
    expect(getDisplaySize(upright)).toEqual({ width: 100, height: 200 });
    expect(getDisplaySize({ ...upright, rotation: 90 })).toEqual({
      width: 200,
      height: 100,
    });
    expect(getDisplaySize({ ...upright, rotation: 180 })).toEqual({
      width: 100,
      height: 200,
    });
    expect(getDisplaySize({ ...upright, rotation: 270 })).toEqual({
      width: 200,
      height: 100,
    });
  });
});

describe("displayRectToPage", () => {
  test("flips the y axis for an upright page", () => {
    expect(
      displayRectToPage({ x: 10, y: 20, width: 30, height: 40 }, upright),
    ).toEqual({
      x: 10,
      y: 140,
      width: 30,
      height: 40,
    });
  });

  test("maps the display top-left to the page bottom-left at 90 degrees", () => {
    expect(
      displayRectToPage(
        { x: 0, y: 0, width: 10, height: 20 },
        { ...upright, rotation: 90 },
      ),
    ).toEqual({ x: 0, y: 0, width: 20, height: 10 });
  });

  test("maps the display top-left to the page top-right at 180 degrees", () => {
    expect(
      displayRectToPage(
        { x: 0, y: 0, width: 10, height: 20 },
        { ...upright, rotation: 180 },
      ),
    ).toEqual({ x: 90, y: 0, width: 10, height: 20 });
  });

  test("maps the display top-left to the page top-right at 270 degrees", () => {
    expect(
      displayRectToPage(
        { x: 0, y: 0, width: 10, height: 20 },
        { ...upright, rotation: 270 },
      ),
    ).toEqual({ x: 80, y: 190, width: 20, height: 10 });
  });

  test("keeps a non-zero view box origin in page space", () => {
    expect(
      displayRectToPage({ x: 0, y: 0, width: 200, height: 200 }, offsetUpright),
    ).toEqual({ x: 50, y: 30, width: 200, height: 200 });
  });
});

describe("pageRectToDisplay", () => {
  test.each([0, 90, 180, 270] as const)(
    "round-trips a rect at %i degrees",
    (rotation) => {
      const geometry: CropPageGeometry = { ...upright, rotation };
      const display = getDisplaySize(geometry);
      const rect = {
        x: display.width * 0.2,
        y: display.height * 0.3,
        width: display.width * 0.4,
        height: display.height * 0.2,
      };
      const page = displayRectToPage(rect, geometry);
      const back = pageRectToDisplay(page, geometry);
      expect(back.x).toBeCloseTo(rect.x, 5);
      expect(back.y).toBeCloseTo(rect.y, 5);
      expect(back.width).toBeCloseTo(rect.width, 5);
      expect(back.height).toBeCloseTo(rect.height, 5);
    },
  );
});

describe("page box helpers", () => {
  test("full page covers the whole view box", () => {
    expect(createFullPageRect(offsetUpright)).toEqual({
      x: 50,
      y: 30,
      width: 200,
      height: 200,
    });
  });

  test("inset keeps the page centre", () => {
    const inset = createInsetPageRect(upright, 0.1);
    expect(inset).toEqual({ x: 10, y: 20, width: 80, height: 160 });
  });

  test("clamp moves an oversized rect back inside the page", () => {
    expect(
      clampPageRect({ x: -20, y: 180, width: 150, height: 60 }, upright),
    ).toEqual({ x: 0, y: 140, width: 100, height: 60 });
  });

  test("clamp leaves a valid rect untouched", () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(clampPageRect(rect, upright)).toEqual(rect);
  });

  test("full-page detection honours the view box origin", () => {
    expect(isFullPageRect(getPageBox(offsetUpright), offsetUpright)).toBe(true);
    expect(isFullPageRect(getPageBox(upright), offsetUpright)).toBe(false);
  });
});

describe("normalizeRotation", () => {
  test("wraps negatives and oversized values", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(0)).toBe(0);
  });
});
