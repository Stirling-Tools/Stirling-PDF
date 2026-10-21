// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  drawRect,
  fitRatio,
  moveRect,
  resizeRect,
  type NormalizedRect,
} from "@app/components/tools/crop/cropInteractionMath";

const start: NormalizedRect = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
const min = { x: 0.01, y: 0.01 };

describe("drawRect", () => {
  test("follows the drag direction", () => {
    const forward = drawRect({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }, null, min);
    const backward = drawRect(
      { x: 0.6, y: 0.7 },
      { x: 0.2, y: 0.3 },
      null,
      min,
    );
    for (const rect of [forward, backward]) {
      expect(rect.x).toBeCloseTo(0.2, 6);
      expect(rect.y).toBeCloseTo(0.3, 6);
      expect(rect.width).toBeCloseTo(0.4, 6);
      expect(rect.height).toBeCloseTo(0.4, 6);
    }
  });

  test("locks the ratio to the dragged box", () => {
    const rect = drawRect({ x: 0, y: 0 }, { x: 0.6, y: 0.2 }, 2, min);
    expect(rect.width / rect.height).toBeCloseTo(2, 6);
    expect(rect.height).toBeCloseTo(0.2, 6);
    expect(rect.width).toBeCloseTo(0.4, 6);
  });

  test("never shrinks below the minimum", () => {
    const rect = drawRect({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, null, {
      x: 0.05,
      y: 0.05,
    });
    expect(rect.width).toBeGreaterThanOrEqual(0.05);
    expect(rect.height).toBeGreaterThanOrEqual(0.05);
  });
});

describe("moveRect", () => {
  test("clamps to the page", () => {
    expect(moveRect(start, -1, 0)).toEqual({ ...start, x: 0 });
    expect(moveRect(start, 1, 1)).toEqual({ ...start, x: 0.6, y: 0.6 });
  });
});

describe("resizeRect", () => {
  test("a corner keeps the opposite corner pinned", () => {
    const rect = resizeRect("se", { x: 0.9, y: 0.8 }, start, null, min);
    expect(rect.x).toBeCloseTo(0.2, 6);
    expect(rect.y).toBeCloseTo(0.2, 6);
    expect(rect.x + rect.width).toBeCloseTo(0.9, 6);
    expect(rect.y + rect.height).toBeCloseTo(0.8, 6);

    const northWest = resizeRect("nw", { x: 0.1, y: 0.1 }, start, null, min);
    expect(northWest.x).toBeCloseTo(0.1, 6);
    expect(northWest.x + northWest.width).toBeCloseTo(0.6, 6);
    expect(northWest.y + northWest.height).toBeCloseTo(0.6, 6);
  });

  test("an east edge keeps the west edge and the vertical centre", () => {
    const rect = resizeRect("e", { x: 0.8, y: 0.3 }, start, null, min);
    expect(rect.x).toBeCloseTo(0.2, 6);
    expect(rect.width).toBeCloseTo(0.6, 6);
    expect(rect.y).toBeCloseTo(0.2, 6);
    expect(rect.height).toBeCloseTo(0.4, 6);
  });

  test("a ratio edge grows symmetrically around the centre", () => {
    const rect = resizeRect("e", { x: 0.8, y: 0.3 }, start, 1, min);
    expect(rect.width).toBeCloseTo(rect.height, 6);
    expect(rect.y + rect.height / 2).toBeCloseTo(start.y + start.height / 2, 6);
  });

  test("a ratio corner stays inside the page", () => {
    const rect = resizeRect("se", { x: 1, y: 1 }, start, 2, min);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1.000001);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1.000001);
    expect(rect.width / rect.height).toBeCloseTo(2, 5);
  });
});

describe("fitRatio", () => {
  test("centres the largest ratio rect inside the page", () => {
    const rect = fitRatio(2, start);
    expect(rect.width / rect.height).toBeCloseTo(2, 6);
    expect(rect.x).toBeCloseTo(0, 6);
    expect(rect.width).toBeCloseTo(0.8, 6);
    expect(rect.y).toBeCloseTo(0.2, 6);
    expect(rect.y + rect.height / 2).toBeCloseTo(0.4, 6);
  });
});
