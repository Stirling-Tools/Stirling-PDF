import { describe, expect, it, vi } from "vitest";
import {
  clampAnchorToPage,
  clampPreviewAnchorToPts,
  computeStampPreviewStyle,
  getStampFootprint,
} from "@app/components/tools/addStamp/StampPreviewUtils";
import {
  defaultParameters,
  type AddStampParameters,
} from "@app/components/tools/addStamp/useAddStampParameters";

const page = { widthPts: 600, heightPts: 800 };
const container = { width: 600, height: 800 };
const image = { url: "stamp.png", width: 250, height: 100 };

function previewAnchor(
  overrides: Partial<AddStampParameters>,
  size = container,
): { left: number; bottom: number } {
  const { item } = computeStampPreviewStyle(
    {
      ...defaultParameters,
      stampType: "image",
      fontSize: 40,
      customMargin: "medium",
      ...overrides,
    },
    image,
    page,
    size,
    false,
    null,
    false,
  );
  return {
    left: parseFloat(`${item.left}`),
    bottom: parseFloat(`${item.bottom}`),
  };
}

describe("getStampFootprint", () => {
  it("is the stamp box when unrotated", () => {
    expect(getStampFootprint(100, 40, 0)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 40,
    });
  });

  it("rotates counter-clockwise about the anchor", () => {
    const footprint = getStampFootprint(100, 40, 90);
    expect(footprint.minX).toBeCloseTo(-40);
    expect(footprint.maxX).toBeCloseTo(0);
    expect(footprint.minY).toBeCloseTo(0);
    expect(footprint.maxY).toBeCloseTo(100);
  });

  it("covers every corner at a non-axis-aligned angle", () => {
    const footprint = getStampFootprint(100, 40, 45);
    expect(footprint.minX).toBeCloseTo(-28.284, 3);
    expect(footprint.maxX).toBeCloseTo(70.711, 3);
    expect(footprint.minY).toBeCloseTo(0);
    expect(footprint.maxY).toBeCloseTo(98.995, 3);
  });
});

describe("clampAnchorToPage", () => {
  it("aligns a footprint larger than the page with the left and bottom edges", () => {
    const clamped = clampAnchorToPage(
      { x: 500, y: 500 },
      getStampFootprint(1000, 1000, 45),
      page,
    );
    expect(clamped.x).toBeCloseTo(707.107, 3);
    expect(clamped.y).toBeCloseTo(0);
  });
});

describe("computeStampPreviewStyle image placement", () => {
  it.each([
    [1, 24.5, 735.5],
    [5, 250, 380],
    [9, 475.5, 24.5],
  ] as const)(
    "leaves unrotated grid position %i unchanged",
    (position, left, bottom) => {
      const anchor = previewAnchor({ position, rotation: 0 });
      expect(anchor.left).toBeCloseTo(left);
      expect(anchor.bottom).toBeCloseTo(bottom);
    },
  );

  it("keeps the margin on rotated grid stamps", () => {
    const anchor = previewAnchor({ position: 1, rotation: 90 });
    expect(anchor.left).toBeCloseTo(64.5);
    expect(anchor.bottom).toBeCloseTo(675.5);
  });

  it("centres the rotated footprint at a non-axis-aligned angle", () => {
    const anchor = previewAnchor({ position: 5, rotation: 45 });
    expect(anchor.left).toBeCloseTo(278.787, 3);
    expect(anchor.bottom).toBeCloseTo(350.503, 3);
  });

  it("clamps an out-of-range override to the rotated footprint", () => {
    const anchor = previewAnchor({
      rotation: 90,
      overrideX: 0,
      overrideY: 800,
    });
    expect(anchor.left).toBeCloseTo(40);
    expect(anchor.bottom).toBeCloseTo(700);
  });

  it("leaves an override alone when the rotated footprint fits", () => {
    const anchor = previewAnchor({
      fontSize: 300,
      rotation: 270,
      overrideX: 0,
      overrideY: 800,
    });
    expect(anchor.left).toBeCloseTo(0);
    expect(anchor.bottom).toBeCloseTo(800);
  });

  it("scales the clamped anchor to the container", () => {
    const anchor = previewAnchor(
      { rotation: 90, overrideX: 0, overrideY: 800 },
      { width: 300, height: 400 },
    );
    expect(anchor.left).toBeCloseTo(20);
    expect(anchor.bottom).toBeCloseTo(350);
  });

  it("keeps a footprint larger than the page on the left and bottom edges", () => {
    const anchor = previewAnchor({ fontSize: 1000, rotation: 45, position: 3 });
    expect(anchor.left).toBeCloseTo(707.107, 3);
    expect(anchor.bottom).toBeCloseTo(0);
  });
});

describe("computeStampPreviewStyle text placement", () => {
  it("ignores rotation when placing text", () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    const anchor = previewAnchor({
      stampType: "text",
      stampText: "Stamp",
      position: 1,
      rotation: 90,
    });
    expect(anchor.left).toBeCloseTo(24.5);
    getContext.mockRestore();
  });
});

describe("clampPreviewAnchorToPts", () => {
  it("converts the clamped pixel position to points", () => {
    const anchor = clampPreviewAnchorToPts(
      { left: 0, bottom: 400 },
      { width: 50, height: 20 },
      90,
      page,
      { width: 300, height: 400 },
    );
    expect(anchor.x).toBeCloseTo(40);
    expect(anchor.y).toBeCloseTo(700);
  });
});
